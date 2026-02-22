<template>
  <div class="app" v-if="ready">
    <Sidebar
      :notes="filteredNotes"
      :all-tags="allTags"
      :all-contacts="allContacts"
      :templates="templates"
      :tasks="tasks"
      :selected-filename="selectedNoteFilename"
      :search-query="searchQuery"
      :active-tag="activeTag"
      :active-contact="activeContact"
      :get-task-color="getTaskColor"
      @select="selectNote"
      @search="searchQuery = $event"
      @set-tag="activeTag = $event"
      @set-contact="activeContact = $event"
      @new-note="createNote(null, false)"
      @new-task="createNote(null, true)"
      @new-from-template="handleNewFromTemplate"
      @toggle-task-done="toggleTaskDone"
    />
    <Editor
      v-if="selectedNote"
      :note="selectedNote"
      :all-tags="allTags"
      :all-contacts="allContacts"
      :all-notes="notes"
      :notes-path="notesPath"
      :backlinks="getBacklinks(selectedNote)"
      :save-lock="saveLock"
      @update-body="(b) => { console.log('[App] update-body received'); updateNoteBody(b); }"
      @update-frontmatter="updateNoteFrontmatter"
      @rename="renameNote"
      @save="() => { console.log('[App] save event received'); saveCurrentNote(); }"
      @delete="confirmDelete"
      @navigate="navigateToNote"
      @toggle-task="toggleTask"
      @toggle-template="toggleTemplate"
    />
    <div v-else class="empty-state">
      <div class="empty-icon">&#128221;</div>
      <p>Notiz auswählen oder neue erstellen</p>
    </div>
  </div>

  <div class="folder-picker" v-else-if="showFolderPicker">
    <div class="folder-picker-card">
      <h2>NoteHub Desktop</h2>
      <p>Bitte wähle den Ordner mit deinen Notizen:</p>
      <button @click="pickFolder" class="btn btn-primary">Ordner auswählen</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, toRaw } from 'vue';
import Sidebar from './components/Sidebar.vue';
import Editor from './components/Editor.vue';
import { useNotes } from './composables/useNotes.js';
import { useTheme } from './composables/useTheme.js';

const {
  notes, selectedNote, selectedNoteFilename, searchQuery, activeTag, activeContact,
  allTags, allContacts, templates, tasks, filteredNotes, saveLock,
  loadNotes, selectNote, saveCurrentNote, updateNoteBody,
  updateNoteFrontmatter, renameNote, createNote, deleteNote,
  getTaskColor, getBacklinks, findNoteByTitle
} = useNotes();

const { initTheme } = useTheme();

const ready = ref(false);
const showFolderPicker = ref(false);
const notesPath = ref('');

onMounted(async () => {
  initTheme();
  const np = await window.api.getNotesPath();
  if (np) {
    notesPath.value = np;
    await loadNotes();
    ready.value = true;
  } else {
    showFolderPicker.value = true;
  }
});

async function pickFolder() {
  const folderPath = await window.api.pickFolder();
  if (folderPath) {
    await window.api.setNotesPath(folderPath);
    notesPath.value = folderPath;
    await loadNotes();
    showFolderPicker.value = false;
    ready.value = true;
  }
}

function handleNewFromTemplate(templateNote) {
  const isTask = templateNote.frontmatter?.type === 'task';
  createNote(templateNote, isTask);
}

function navigateToNote(title) {
  const note = findNoteByTitle(title);
  if (note) {
    selectNote(note.filename);
  }
}

function toggleTask() {
  if (!selectedNote.value) return;
  const fm = { ...selectedNote.value.frontmatter };
  if (fm.type === 'task') {
    fm.type = 'note';
    delete fm.status;
    delete fm.due;
    delete fm.priority;
    delete fm.person;
    delete fm.remind;
    delete fm.reminded;
    delete fm.start;
  } else {
    fm.type = 'task';
    fm.status = 'open';
    fm.priority = 2;
  }
  updateNoteFrontmatter(fm);
}

function toggleTemplate() {
  if (!selectedNote.value) return;
  const fm = { ...selectedNote.value.frontmatter };
  if (fm.template) {
    delete fm.template;
    delete fm.template_name;
  } else {
    fm.template = true;
    fm.template_name = selectedNote.value.title;
  }
  updateNoteFrontmatter(fm);
}

function toggleTaskDone(note) {
  const fm = { ...note.frontmatter };
  fm.status = fm.status === 'done' ? 'open' : 'done';
  const idx = notes.value.findIndex(n => n.filename === note.filename);
  if (idx >= 0) {
    notes.value[idx] = { ...notes.value[idx], frontmatter: fm };
    window.api.saveNote({ filename: note.filename, frontmatter: JSON.parse(JSON.stringify(fm)), body: note.body || '' });
  }
}

function confirmDelete() {
  if (selectedNote.value && confirm(`"${selectedNote.value.title}" wirklich löschen?`)) {
    deleteNote();
  }
}
</script>
