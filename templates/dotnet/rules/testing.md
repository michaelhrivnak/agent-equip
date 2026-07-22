# Testing

- Tests run via `dotnet test` (xUnit / NUnit / MSTest — check the test project's `.csproj`). Every
  change should be covered by a new or updated test; run the affected tests and make sure they pass.
- Run the minimum needed while iterating — filter to a project or test
  (`dotnet test --filter "FullyQualifiedName~<name>"`) rather than the whole solution.
- Fix failures one at a time; don't move on until the one you're working on passes.
