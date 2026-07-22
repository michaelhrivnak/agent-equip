import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
import { clearArtifact, ensureDir, type Outcome, sameFile } from "../merge.ts";

// A preserveOrder XML node: one element-tag key (whose value is an array of child nodes) plus an
// optional `:@` attributes key. Text is a `#text` key; comments a `#comment` key.
type XmlNode = Record<string, unknown>;

const XML_ATTRS = ":@";

const xmlParser = new XMLParser({
	ignoreAttributes: false,
	preserveOrder: true,
	commentPropName: "#comment",
	parseTagValue: false,
	// Keep entities (`&apos;`, `&lt;`, …) verbatim so a round-trip never re-encodes untouched
	// lines — e.g. a `'` in an MSBuild Condition must not become `&apos;`.
	processEntities: false,
});
const xmlBuilder = new XMLBuilder({
	ignoreAttributes: false,
	preserveOrder: true,
	commentPropName: "#comment",
	format: true,
	indentBy: "  ",
	suppressEmptyNode: true,
	processEntities: false,
});

/** The element tag of a node (its only non-attribute key), or undefined. */
function tagOf(node: XmlNode): string | undefined {
	return Object.keys(node).find((k) => k !== XML_ATTRS);
}

/** The `Include=` attribute of an MSBuild item node, or "" when absent. */
function includeOf(node: XmlNode): string {
	const attrs = node[XML_ATTRS] as Record<string, string> | undefined;
	return attrs?.["@_Include"] ?? "";
}

/** Whether a node carries a `Condition=` — i.e. it only applies in some builds. */
function hasCondition(node: XmlNode): boolean {
	const attrs = node[XML_ATTRS] as Record<string, string> | undefined;
	return attrs?.["@_Condition"] !== undefined;
}

/** The `<Project>` node in a parsed preserveOrder root, or undefined. */
function findProject(root: XmlNode[]): XmlNode | undefined {
	return root.find((n) => tagOf(n) === "Project");
}

/**
 * Union the template's `<Project>` children into the target's (mutating `tgt`): PropertyGroup tags
 * the target already sets win (skipped); ItemGroup items are keyed by (tag + Include) and added
 * only when missing; any other top-level element is added when the target lacks that tag. Returns
 * whether anything was added.
 */
function unionProject(tmpl: XmlNode[], tgt: XmlNode[]): boolean {
	const props = new Set<string>();
	const items = new Set<string>();
	let firstPropGroup: XmlNode[] | undefined;
	let firstItemGroup: XmlNode[] | undefined;
	for (const child of tgt) {
		const tag = tagOf(child);
		if (tag === "PropertyGroup") {
			const kids = child.PropertyGroup as XmlNode[];
			// Only append into an *unconditional* group — adding to a `Condition="…"` group would
			// silently scope our settings to some builds only.
			if (!hasCondition(child)) firstPropGroup ??= kids;
			for (const k of kids) {
				const t = tagOf(k);
				if (t && t !== "#comment") props.add(t);
			}
		} else if (tag === "ItemGroup") {
			const kids = child.ItemGroup as XmlNode[];
			if (!hasCondition(child)) firstItemGroup ??= kids;
			for (const k of kids) {
				const t = tagOf(k);
				if (t && t !== "#comment") items.add(`${t}::${includeOf(k)}`);
			}
		}
	}

	let added = false;
	for (const child of tmpl) {
		const tag = tagOf(child);
		if (tag === "PropertyGroup") {
			for (const k of child.PropertyGroup as XmlNode[]) {
				const t = tagOf(k);
				if (!t || t === "#comment" || props.has(t)) continue;
				if (!firstPropGroup) {
					firstPropGroup = [];
					tgt.push({ PropertyGroup: firstPropGroup });
				}
				firstPropGroup.push(k);
				props.add(t);
				added = true;
			}
		} else if (tag === "ItemGroup") {
			for (const k of child.ItemGroup as XmlNode[]) {
				const t = tagOf(k);
				if (!t || t === "#comment") continue;
				const key = `${t}::${includeOf(k)}`;
				if (items.has(key)) continue;
				if (!firstItemGroup) {
					firstItemGroup = [];
					tgt.push({ ItemGroup: firstItemGroup });
				}
				firstItemGroup.push(k);
				items.add(key);
				added = true;
			}
		} else if (
			tag &&
			tag !== "#comment" &&
			!tgt.some((n) => tagOf(n) === tag)
		) {
			tgt.push(child);
			added = true;
		}
	}
	return added;
}

/**
 * Merge a template MSBuild file (`*.csproj`/`*.props`/`*.targets`) into the target's — the XML
 * analog of `mergeJson`, specific to MSBuild's `<Project>`/`<PropertyGroup>`/`<ItemGroup>` shape:
 * the target's values win, and properties/items the template introduces are added. Absent target →
 * seed. Malformed (or `<Project>`-less) target → never overwrite; leave a `${dst}.agent-equip-new`.
 * Idempotent: when the union adds nothing, report up-to-date without rewriting (so an unchanged
 * file never churns its formatting).
 */
export function mergeMsbuild(
	src: string,
	dst: string,
	dryRun = false,
): Outcome {
	if (!existsSync(dst)) {
		if (!dryRun) {
			ensureDir(dst);
			copyFileSync(src, dst);
		}
		return "created";
	}
	if (sameFile(src, dst)) {
		if (!dryRun) clearArtifact(dst);
		return "up-to-date";
	}
	const current = readFileSync(dst, "utf8");
	const tgtRoot =
		XMLValidator.validate(current) === true ? xmlParser.parse(current) : null;
	const tgtProject = tgtRoot ? findProject(tgtRoot) : undefined;
	const tmplProject = findProject(xmlParser.parse(readFileSync(src, "utf8")));
	if (!tgtRoot || !tgtProject || !tmplProject) {
		// Malformed, or no <Project> to merge into — do not touch it; leave a reconcile copy.
		if (!dryRun) copyFileSync(src, `${dst}.agent-equip-new`);
		return "new-written";
	}
	const added = unionProject(
		tmplProject.Project as XmlNode[],
		tgtProject.Project as XmlNode[],
	);
	if (!added) {
		if (!dryRun) clearArtifact(dst);
		return "up-to-date";
	}
	// The builder always encodes `'` as `&apos;` in attribute values; revert it (an apostrophe is
	// legal inside a double-quoted attribute) so MSBuild Conditions aren't rewritten. `processEntities:
	// false` keeps every other entity (`&lt;`, `&amp;`, …) verbatim.
	const built = (xmlBuilder.build(tgtRoot) as string).replaceAll("&apos;", "'");
	const next = `${built.trim()}\n`;
	if (!dryRun) writeFileSync(dst, next);
	return "merged-msbuild";
}
