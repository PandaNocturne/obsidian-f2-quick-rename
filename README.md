# F2 Rename

Obsidian plugin that renames the current note, or an embedded note/image under the cursor — including wiki aliases (`![[img.png|alias]]`) and markdown image alt text (`![alias](img.png)`).

Migrated from a QuickAdd user script. Author: **PandaNocturne**.

## Features

- **F2** (default hotkey): rename current file
- Cursor on a heading → Obsidian's native "Rename heading"
- Cursor on / selection of a wiki link or markdown image → rename the linked file
- Excalidraw files: prompt without the `.excalidraw` suffix, restore it on save
- Companion files in the same folder with the same basename (different extension) are renamed together
- New name is copied to the clipboard when renaming the current file

## Develop

```bash
npm install
npm run dev
```

Enable the plugin in Obsidian (folder: `obsidian-f2-rename`). With [Hot Reload](https://github.com/pjeby/hot-reload) installed, changes rebuild automatically.

Production build:

```bash
npm run build
```
