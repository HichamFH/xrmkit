# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are 0.x: expect changes between releases.

## [0.9.2] - 2026-11-13

### Changed
- The extension is now named "Xrmkit" in the browser and in the store. "for Dynamics 365" stays in the description, so the name no longer carries a Microsoft trademark.
- Shorter store description that also names Power Platform.

## [0.9.1] - 2026-11-10

### Changed
- The interface language follows the browser language until you pick one (English unless the browser is set to French). It used to always start in French.
- Explaining a plug-in trace with the AI now asks for a confirmation that names the configured provider. The button no longer says the trace goes to Anthropic whatever the provider is.

### Fixed
- 74 screen texts (help paragraphs, labels, empty states) were still in French in the English interface.
- The environment comparison showed a raw JavaScript error when information about the current tab was missing.

### Added
- Tests that fail if French text shows up in the English interface, and a test for the default language.

## [0.9.0] - 2026-11-06

### Added
- Process map: plug-ins, cloud flows, workflows and business rules of a table in Dataverse execution order, with cascades between tables, loop detection, and export to Word, Excel, SVG and Mermaid.
- User access report: direct and team roles, effective rights per table with their depth, sensitive rights and attention points, exported to Word or Excel. Rights come from `RetrieveUserPrivileges`, with a fallback on role privileges.
- Word templates: import a .docx or .dotx with `{{tags}}` and loops, and generate the process map, access report and data dictionary in your own format. Starter templates can be downloaded from each report.
- ZIP reader in `office.js` (stored and deflate entries), used to read templates without any dependency.
- Test suite in the repository: unit tests and a jsdom smoke test (`npm test`).
- Extension name and description localized in English (default) and French.
- README in English and French, and this changelog.

### Changed
- New extension icon: dark gradient tile that stays readable on light and dark toolbars.
- Empty cells in the rights matrix and the process map show a hyphen instead of a long dash.

### Fixed
- Attention points, the row counter, team labels and several other strings stayed in French in the English interface.
- The environment comparison now finds tabs on the `microsoftdynamics.us` domain.
- The popup footer showed the previous version number.

## [0.8.2]

### Changed
- Emoji replaced by a hand-drawn SVG icon set (`workbench/icons.js`). A tab registered with `registerTab({ icon })` can use any icon from the set.

## [0.8.1]

### Removed
- The "Cloudflare Worker" AI provider and the `cloudflare-worker/` folder. Providers kept: Anthropic, OpenAI and Cloudflare Workers AI. The `*.workers.dev` permission was dropped.

## [0.8.0]

### Added
- Dashboard as the home page: tables, solutions, plug-in steps, flows, automation by category, flow health, failed system jobs over 14 days, recent solutions and the signed-in user.
- Top bar with tool search, English/French switch, error notifications, dark mode and user menu.
- Dependency-free SVG charts (`charts.js`).
- Performance analysis: score, timing by category, slowest calls, request waterfall and a history of measurements.
- Tab registry (`Xrmkit.registerTab`, `Xrmkit.lazy`) for adding tools.

### Changed
- Duplicate simultaneous GET requests are merged, metadata is cached for 60 seconds (cleared by any write), and the table filter is debounced.
- The solution documentation tab loads on first open.

## [0.7.2]

### Security
- API keys are never stored in clear text. They are kept for the browser session, or in a vault encrypted with PBKDF2 and AES-GCM. Keys saved by older versions are migrated.
- Emails, phone numbers, IBANs and long numbers are masked before anything is sent to an AI provider, and sending a table asks for confirmation.
- Removed the optional `https://*/*` permission and added a strict content security policy.
- Chat history is deleted after 30 days.

## [0.7.1]

### Changed
- Redesigned AI assistant and more readable result tables in the popup.

### Removed
- The offline snapshots tab, replaced by the live environment comparison.

## [0.7.0]

### Added
- Solution documentation: pick solutions and sections, and Xrmkit reads tables, columns, relationships, option sets, forms, views, dashboards, flows, rules, workflows, actions, process flows, plug-ins, web resources, apps, site maps, roles, environment variables and connection references. Output has a layered architecture diagram, an entity-relationship diagram, an automation matrix and deduced use cases. Exports: interactive HTML, Word, Markdown with Mermaid, Excel and JSON. Optional AI summary using names and descriptions only.

## [0.6.0]

### Added
- AI chat as a full page and as a side panel. Context is collected automatically and can be edited, "See what is sent" shows the exact text, and confidential mode excludes record values.
- Read-only tools for the AI: tables, columns, relationships, option sets, solutions, steps, flows, workflow definitions, web resources, form details, errors, performance and read-only queries.
- Proposed actions that are never run without confirmation (update, create or delete a record, enable or disable a step or a flow).
- Local chat history (20 conversations), token estimate and an "Ask the AI" button on any table.

## [0.5.0]

### Added
- Live comparison of two environments across 11 categories, with a Word or Excel delivery report.
- Performance analysis, form debug, flow health, items outside solutions and test data generated from the model.

## [0.3.x]

### Added
- New logo and redesigned popup and Workbench. Dialogs replace the browser `confirm` and `prompt`: bulk actions stay disabled until the exact record count is typed.
- Plug-in navigation from assembly to plug-in to steps, with managed assemblies hidden by default.
- Impact analysis and web resource search read in small batches with progress, and a failing source no longer stops the analysis.
- Responsive layout with a collapsible menu.

## [0.2.0]

### Added
- Impact analysis, plug-in steps, system jobs, audit log, form inspector, access explanation (`RetrievePrincipalAccess`) and role comparison, data dictionary, test data generator, CSV import with dry run, bulk update, snapshots, and bug reports with context and a screenshot.

## [0.1.0]

### Added
- First version: popup quick actions, queries (FetchXML, OData, raw Web API), metadata, plug-in traces, flows, solutions and roles, impersonation, environment information and the AI query assistant.
