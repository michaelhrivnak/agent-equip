import { expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hash } from "../../src/manifest.ts";
import { mergeJson, mergeMsbuild } from "../../src/merge.ts";
import { useSandbox } from "../helpers.ts";

const ctx = useSandbox();

/** Write a template + target JSON pair in the sandbox, return their paths. */
function jsonFixtures(
	tpl: string,
	target?: string,
): { src: string; dst: string } {
	const src = join(ctx.target, "tpl.json");
	const dst = join(ctx.target, "out.json");
	writeFileSync(src, tpl);
	if (target !== undefined) writeFileSync(dst, target);
	return { src, dst };
}

test("mergeJson seeds an absent target and records its hash", () => {
	const { src, dst } = jsonFixtures(`{"a":1}\n`);
	const r = mergeJson(src, dst, undefined);
	expect(r.outcome).toBe("created");
	expect(r.hash).toBe(hash(readFileSync(dst)));
});

test("mergeJson deep-merges (existing wins), reports merged-json, records the merged hash", () => {
	const { src, dst } = jsonFixtures(`{"a":1,"b":2}\n`, `{"a":9}\n`);
	const r = mergeJson(src, dst, hash(`{"a":9}\n`)); // prevHash == current → not hand-edited
	expect(r.outcome).toBe("merged-json");
	const out = JSON.parse(readFileSync(dst, "utf8"));
	expect(out.a).toBe(9); // existing wins
	expect(out.b).toBe(2); // template key added
	expect(r.hash).toBe(hash(readFileSync(dst)));
});

test("mergeJson surfaces a hand-edited target as forked yet still merges non-destructively", () => {
	const { src, dst } = jsonFixtures(`{"a":1,"b":2}\n`, `{"a":9}\n`);
	const r = mergeJson(src, dst, hash(`{"a":1}\n`)); // prevHash != current → hand-edited
	expect(r.outcome).toBe("forked");
	const out = JSON.parse(readFileSync(dst, "utf8"));
	expect(out.a).toBe(9); // user edit kept
	expect(out.b).toBe(2); // template key still added (safe)
});

test("mergeJson never overwrites malformed JSON; records the fork sentinel", () => {
	const { src, dst } = jsonFixtures(`{"a":1}\n`, "{bad");
	const r = mergeJson(src, dst, undefined);
	expect(r.outcome).toBe("new-written");
	expect(r.hash).toBe("forked");
	expect(readFileSync(dst, "utf8")).toBe("{bad"); // untouched
	expect(existsSync(`${dst}.agent-equip-new`)).toBe(true);
});

test("mergeJson goes silent on a malformed target once the sentinel is recorded (no artifact churn)", () => {
	const { src, dst } = jsonFixtures(`{"a":1}\n`, "{bad");
	const first = mergeJson(src, dst, undefined);
	expect(first.hash).toBe("forked");
	rmSync(`${dst}.agent-equip-new`); // user reviews and removes the reconcile copy

	const second = mergeJson(src, dst, first.hash); // sentinel is the prior hash now
	expect(second.outcome).toBe("forked");
	expect(second.hash).toBe("forked");
	expect(existsSync(`${dst}.agent-equip-new`)).toBe(false); // NOT recreated
});

const TEMPLATE = `<Project>
  <PropertyGroup>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <AnalysisLevel>latest-recommended</AnalysisLevel>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Roslynator.Analyzers" Version="4.13.1" PrivateAssets="all" />
  </ItemGroup>
</Project>
`;

/** Write the shared template + a target props file, return their paths. */
function fixtures(dst: string): { src: string; dstPath: string } {
	const src = join(ctx.target, "template.props");
	const dstPath = join(ctx.target, "Directory.Build.props");
	writeFileSync(src, TEMPLATE);
	if (dst !== "") writeFileSync(dstPath, dst);
	return { src, dstPath };
}

test("mergeMsbuild seeds the template when the target is absent", () => {
	const { src, dstPath } = fixtures("");
	expect(mergeMsbuild(src, dstPath)).toBe("created");
	expect(readFileSync(dstPath, "utf8")).toContain("Roslynator.Analyzers");
});

test("mergeMsbuild keeps the target's property value and adds the template's new ones", () => {
	const { src, dstPath } = fixtures(
		`<Project>
  <PropertyGroup>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
`,
	);
	expect(mergeMsbuild(src, dstPath)).toBe("merged-msbuild");
	const out = readFileSync(dstPath, "utf8");
	expect(out).toContain("<TreatWarningsAsErrors>false</TreatWarningsAsErrors>"); // target wins
	expect(out).toContain("AnalysisLevel"); // added
	expect(out).toContain("Roslynator.Analyzers"); // item added
});

test("mergeMsbuild is a no-op (up-to-date, unchanged) when the target already has every setting", () => {
	const existing = `<Project>
  <PropertyGroup>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <AnalysisLevel>latest-recommended</AnalysisLevel>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Roslynator.Analyzers" Version="9.9.9" />
  </ItemGroup>
</Project>
`;
	const { src, dstPath } = fixtures(existing);
	expect(mergeMsbuild(src, dstPath)).toBe("up-to-date");
	expect(readFileSync(dstPath, "utf8")).toBe(existing); // byte-for-byte untouched
	expect(existsSync(`${dstPath}.agent-equip-new`)).toBe(false);
});

test("mergeMsbuild never overwrites a malformed target; leaves a reconcile copy", () => {
	const bad = "<Project><PropertyGroup>";
	const { src, dstPath } = fixtures(bad);
	expect(mergeMsbuild(src, dstPath)).toBe("new-written");
	expect(readFileSync(dstPath, "utf8")).toBe(bad); // untouched
	expect(existsSync(`${dstPath}.agent-equip-new`)).toBe(true);
});

test("mergeMsbuild adds items to an unconditional group, not a Condition-scoped one", () => {
	// The target's only ItemGroup is build-conditional — appending Roslynator there would scope it
	// to .NETFramework only. It must land in a fresh unconditional group instead.
	const { src, dstPath } = fixtures(
		`<Project>
  <ItemGroup Condition="'$(TargetFrameworkIdentifier)' == '.NETFramework'">
    <Reference Include="System" />
  </ItemGroup>
</Project>
`,
	);
	expect(mergeMsbuild(src, dstPath)).toBe("merged-msbuild");
	const out = readFileSync(dstPath, "utf8");
	expect(out).toContain("Roslynator.Analyzers");
	// The conditional group keeps only its own reference.
	const cond = out.slice(
		out.indexOf("NETFramework"),
		out.indexOf("</ItemGroup>", out.indexOf("NETFramework")),
	);
	expect(cond).not.toContain("Roslynator");
});

test("mergeMsbuild preserves entities verbatim (no ' -> &apos; churn on untouched lines)", () => {
	const { src, dstPath } = fixtures(
		`<Project>
  <ItemGroup Condition="'$(TargetFrameworkIdentifier)' == '.NETFramework'">
    <Reference Include="System" />
  </ItemGroup>
</Project>
`,
	);
	expect(mergeMsbuild(src, dstPath)).toBe("merged-msbuild");
	const out = readFileSync(dstPath, "utf8");
	expect(out).not.toContain("&apos;");
	expect(out).toContain("'$(TargetFrameworkIdentifier)'");
});

test("mergeMsbuild is idempotent: a second run adds nothing", () => {
	const { src, dstPath } = fixtures(
		`<Project>
  <PropertyGroup>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
`,
	);
	expect(mergeMsbuild(src, dstPath)).toBe("merged-msbuild");
	expect(mergeMsbuild(src, dstPath)).toBe("up-to-date");
});
