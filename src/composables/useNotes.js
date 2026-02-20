import { ref, computed, watch, toRaw } from 'vue';

const notes = ref([]);
const selectedNoteFilename = ref(null);
const searchQuery = ref('');
const activeTag = ref(null);
const saveLock = ref(false);
let saveTimer = null;
let initialized = ref(false);
let dirty = false;

export function useNotes() {
  const allTags = computed(() => {
    const tagSet = new Set();
    notes.value.forEach(n => {
      const tags = n.frontmatter?.tags;
      if (Array.isArray(tags)) {
        tags.forEach(t => tagSet.add(t));
      }
    });
    return [...tagSet].sort((a, b) => a.localeCompare(b, 'de'));
  });

  const templates = computed(() => {
    return notes.value.filter(n => n.frontmatter?.template === true);
  });

  const tasks = computed(() => {
    return notes.value.filter(n => n.frontmatter?.type === 'task');
  });

  const selectedNote = computed(() => {
    if (!selectedNoteFilename.value) return null;
    return notes.value.find(n => n.filename === selectedNoteFilename.value) || null;
  });

  const filteredNotes = computed(() => {
    let result = notes.value.filter(n => n.frontmatter?.template !== true);

    if (activeTag.value) {
      result = result.filter(n => {
        const tags = n.frontmatter?.tags;
        return Array.isArray(tags) && tags.includes(activeTag.value);
      });
    }

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q)
      );
    }

    return result;
  });

  function getTaskColor(note) {
    if (note.frontmatter?.type !== 'task') return null;
    if (note.frontmatter?.status === 'done') return 'green';

    const now = new Date();
    const due = note.frontmatter?.due ? new Date(note.frontmatter.due) : null;
    const start = note.frontmatter?.start ? new Date(note.frontmatter.start) : null;

    if (!due) return 'green';

    if (due < now) return 'red';

    if (!start) {
      const daysLeft = (due - now) / (1000 * 60 * 60 * 24);
      if (daysLeft <= 1) return 'red';
      if (daysLeft <= 3) return 'yellow';
      return 'green';
    }

    const total = due - start;
    const elapsed = now - start;
    const progress = Math.max(0, Math.min(1, elapsed / total));

    if (progress > 0.66) return 'red';
    if (progress > 0.33) return 'yellow';
    return 'green';
  }

  async function loadNotes() {
    // Preserve dirty note's in-memory state across reload
    const dirtyNote = dirty && selectedNoteFilename.value
      ? notes.value.find(n => n.filename === selectedNoteFilename.value)
      : null;

    const data = await window.api.readNotes();

    if (dirtyNote) {
      const idx = data.findIndex(n => n.filename === dirtyNote.filename);
      if (idx >= 0) {
        data[idx] = { ...data[idx], body: dirtyNote.body, frontmatter: dirtyNote.frontmatter };
        console.log('[useNotes] loadNotes: preserved dirty note:', dirtyNote.filename);
      }
    }

    notes.value = data;
    initialized.value = true;
  }

  async function selectNote(filename) {
    // Save current note first if needed
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (selectedNote.value) {
        await saveCurrentNote();
      }
    }
    selectedNoteFilename.value = filename;
  }

  async function saveCurrentNote() {
    const note = selectedNote.value;
    if (!note) {
      console.log('[useNotes] saveCurrentNote: no note selected');
      return;
    }
    if (saveLock.value) {
      console.log('[useNotes] saveCurrentNote: save locked, skipping');
      return;
    }
    saveLock.value = true;
    console.log('[useNotes] saveCurrentNote:', note.filename, '(' + note.body.length + ' chars)');
    const rawNote = toRaw(note);
    const payload = {
      filename: rawNote.filename,
      frontmatter: JSON.parse(JSON.stringify(toRaw(rawNote.frontmatter) || {})),
      body: rawNote.body || ''
    };
    console.log('[useNotes] calling window.api.saveNote, payload:', JSON.stringify(payload).substring(0, 200));
    try {
      const result = await window.api.saveNote(payload);
      console.log('[useNotes] saveNote IPC returned:', JSON.stringify(result));
      if (result.success) {
        dirty = false;
        console.log('[useNotes] saveCurrentNote: OK');
      } else {
        console.error('[useNotes] saveCurrentNote: FAILED', result.error);
      }
    } catch (err) {
      console.error('[useNotes] saveCurrentNote: EXCEPTION', err);
    } finally {
      saveLock.value = false;
    }
  }

  function debouncedSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      console.log('[useNotes] debouncedSave: timer fired');
      saveTimer = null;
      await saveCurrentNote();
    }, 2000);
  }

  function updateNoteBody(body) {
    const note = selectedNote.value;
    if (!note) return;
    const idx = notes.value.findIndex(n => n.filename === note.filename);
    if (idx >= 0) {
      notes.value[idx] = { ...notes.value[idx], body };
      dirty = true;
      debouncedSave();
    }
  }

  function updateNoteFrontmatter(frontmatter) {
    const note = selectedNote.value;
    if (!note) return;
    const idx = notes.value.findIndex(n => n.filename === note.filename);
    if (idx >= 0) {
      notes.value[idx] = { ...notes.value[idx], frontmatter: { ...frontmatter } };
      dirty = true;
      debouncedSave();
    }
  }

  async function renameNote(newTitle) {
    const note = selectedNote.value;
    if (!note) return;
    const newFilename = newTitle + '.md';
    if (newFilename === note.filename) return;

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    saveLock.value = true;
    try {
      const result = await window.api.saveNote({
        filename: note.filename,
        newFilename,
        frontmatter: JSON.parse(JSON.stringify(toRaw(note.frontmatter) || {})),
        body: note.body || ''
      });
      if (result.success) {
        const idx = notes.value.findIndex(n => n.filename === note.filename);
        if (idx >= 0) {
          notes.value[idx] = { ...notes.value[idx], filename: newFilename, title: newTitle };
        }
        selectedNoteFilename.value = newFilename;
      }
    } finally {
      saveLock.value = false;
    }
  }

  async function createNote(templateNote = null, asTask = false) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '_');
    const title = `${dateStr} ${timeStr}`;
    const filename = title + '.md';

    let frontmatter = { type: asTask ? 'task' : 'note', tags: [] };
    let body = '';

    if (asTask) {
      frontmatter.status = 'open';
      frontmatter.priority = 2;
    }

    if (templateNote) {
      body = templateNote.body
        .replace(/\{\{date\}\}/g, dateStr)
        .replace(/\{\{time\}\}/g, now.toTimeString().slice(0, 5))
        .replace(/\{\{datetime\}\}/g, `${dateStr} ${now.toTimeString().slice(0, 5)}`);
      // Merge template frontmatter but keep type and template flags
      const tmplFm = { ...templateNote.frontmatter };
      delete tmplFm.template;
      delete tmplFm.template_name;
      frontmatter = { ...frontmatter, ...tmplFm, type: asTask ? 'task' : (tmplFm.type || 'note') };
    }

    const result = await window.api.saveNote({ filename, frontmatter, body });
    if (result.success) {
      const newNote = {
        filename: result.filename,
        title,
        frontmatter,
        body,
        modified: Date.now()
      };
      notes.value.unshift(newNote);
      selectedNoteFilename.value = result.filename;
    }
  }

  async function deleteNote() {
    const note = selectedNote.value;
    if (!note) return;
    const result = await window.api.deleteNote(note.filename);
    if (result.success) {
      notes.value = notes.value.filter(n => n.filename !== note.filename);
      selectedNoteFilename.value = null;
    }
  }

  function getBacklinks(note) {
    if (!note) return [];
    const title = note.title;
    const backlinks = [];
    notes.value.forEach(n => {
      if (n.filename === note.filename) return;
      const lines = n.body.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes(`[[${title}]]`)) {
          backlinks.push({
            filename: n.filename,
            title: n.title,
            line: idx + 1,
            context: line.trim()
          });
        }
      });
    });
    return backlinks;
  }

  function getWikilinks(body) {
    const regex = /\[\[([^\]]+)\]\]/g;
    const links = [];
    let match;
    while ((match = regex.exec(body)) !== null) {
      links.push(match[1]);
    }
    return links;
  }

  function findNoteByTitle(title) {
    return notes.value.find(n => n.title === title) || null;
  }

  // Listen for external file changes
  if (typeof window !== 'undefined' && window.api) {
    window.api.onFilesChanged(() => {
      loadNotes();
    });
  }

  return {
    notes,
    selectedNote,
    selectedNoteFilename,
    searchQuery,
    activeTag,
    allTags,
    templates,
    tasks,
    filteredNotes,
    initialized,
    saveLock,
    loadNotes,
    selectNote,
    saveCurrentNote,
    updateNoteBody,
    updateNoteFrontmatter,
    renameNote,
    createNote,
    deleteNote,
    getTaskColor,
    getBacklinks,
    getWikilinks,
    findNoteByTitle,
    debouncedSave
  };
}
