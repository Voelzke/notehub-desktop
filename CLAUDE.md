# NoteHub Desktop

Electron Desktop-App zum Lesen und Bearbeiten von Markdown-Notizen mit YAML-Frontmatter.

## Technologie-Stack
- **Electron** - Desktop-Framework
- **Vue.js 3** - Frontend (Composition API)
- **Vite** - Build-Tool
- **js-yaml** - YAML-Frontmatter Parsing
- **chokidar** - Dateisystem-Überwachung

## Projektstruktur
```
main.js          - Electron Hauptprozess (IPC, Dateisystem, Fenster)
preload.js       - IPC-Bridge (contextBridge)
vite.config.js   - Vite-Konfiguration
index.html       - HTML-Entry
src/
  main.js        - Vue App Entry
  App.vue        - Root-Komponente (Folder Picker, Layout)
  components/
    Sidebar.vue  - Linke Seitenleiste (Suche, Tags, Vorlagen, Aufgaben, Notizliste)
    Editor.vue   - Editor (Titel, Toolbar, Textarea, Wikilinks, Backlinks)
    TaskBar.vue  - Aufgaben-Leiste (Status, Fällig, Priorität, Person)
    TagInput.vue - Tag-Chips mit Autocomplete
  composables/
    useNotes.js  - Notiz-State (CRUD, Parsing, Suche, Filter, Auto-Save)
    useTheme.js  - Dark/Light Theme
  assets/
    styles.css   - Globale Styles (CSS-Variablen für beide Themes)
```

## Befehle
```bash
npm run dev          # Entwicklungsmodus (Vite + Electron)
npm run build:win    # Windows Build (NSIS)
npm run build:mac    # macOS Build (DMG)
npm run build:linux  # Linux Build (AppImage)
```

## Datenformat
Markdown-Dateien mit YAML-Frontmatter:
```yaml
---
type: note|task
status: open|in-progress|done
tags: [tag1, tag2]
due: 2026-03-01
priority: 1|2|3
person: Name
remind: 2026-02-28
start: 2026-02-01
template: true
template_name: Vorlagenname
---
```

## IPC-Kanäle (main ↔ renderer)
- `get-notes-path` / `set-notes-path` - Einstellungen
- `read-notes` - Alle Notizen laden
- `read-note` - Einzelne Notiz laden
- `save-note` - Notiz speichern (mit Umbenennung)
- `delete-note` - Notiz löschen
- `pick-folder` - Ordner-Dialog
- `files-changed` - Event bei externen Änderungen

## Features
- Sidebar mit Suche, Tags, Vorlagen, Aufgaben
- Markdown-Editor mit Toolbar und Auto-Save (2s Debounce)
- Aufgaben mit Farbpunkten (Grün→Gelb→Rot)
- Tag-System mit Autocomplete
- Wikilinks `[[Titel]]` mit Autocomplete und Ctrl+Klick
- Backlinks (alle Notizen die auf aktuelle verlinken)
- Templates mit Platzhaltern ({{date}}, {{time}}, {{datetime}})
- Dark/Light Theme (System-Einstellung)
- Resizable Sidebar
