export const YAML_REPAIR_DEFAULT_COMMAND = `Repair the YAML work file end-to-end:
- Fix all syntax errors reported by yamlParse.
- Replace every __FILL_FROM_CONTEXT__ placeholder using nearby context and site defaults.
- After every replace, call yamlParse before any other tool until the file parses cleanly.
- If yamlParse reports that errors increased, call undo (never reverse the edit with replace), then yamlParse, then retry with a smaller edit.
- When done, reply briefly that the file is valid YAML.`;
