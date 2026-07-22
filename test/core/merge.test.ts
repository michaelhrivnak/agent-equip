import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mergeMsbuild } from "../../src/merge.ts";
import { useSandbox } from "../helpers.ts";

const ctx = useSandbox();

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
