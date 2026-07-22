# Testing

- Tests run via `php artisan test` (Pest or PHPUnit — check `composer.json` / `tests/`). Every
  change should be covered by a new or updated test; run the affected tests and make sure they pass.
- Run the minimum tests needed — filter to the file or test you're working on
  (`php artisan test --compact --filter=...`) rather than the whole suite.
- Fix failures one at a time; don't move on until the one you're working on passes.
