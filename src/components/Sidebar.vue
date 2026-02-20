<template>
  <aside class="sidebar" :style="{ width: sidebarWidth + 'px' }">
    <div class="sidebar-header">
      <h1 class="sidebar-title">NoteHub</h1>
      <div class="sidebar-actions">
        <button @click="showNewMenu = !showNewMenu" class="btn-icon" title="Neue Notiz">+</button>
      </div>
    </div>

    <!-- New Note Menu -->
    <div v-if="showNewMenu" class="new-menu">
      <button @click="$emit('new-note'); showNewMenu = false" class="new-menu-item">
        Neue Notiz
      </button>
      <button @click="$emit('new-task'); showNewMenu = false" class="new-menu-item">
        Neue Aufgabe
      </button>
      <div v-if="templates.length > 0" class="new-menu-divider"></div>
      <button
        v-for="tmpl in templates"
        :key="tmpl.filename"
        @click="$emit('new-from-template', tmpl); showNewMenu = false"
        class="new-menu-item"
      >
        {{ tmpl.frontmatter.template_name || tmpl.title }}
      </button>
    </div>

    <!-- Search -->
    <div class="search-box">
      <input
        type="text"
        :value="searchQuery"
        @input="$emit('search', $event.target.value)"
        placeholder="Suchen..."
        class="search-input"
      />
      <button
        v-if="searchQuery"
        @click="$emit('search', '')"
        class="search-clear"
      >&times;</button>
    </div>

    <!-- Tags Section -->
    <div class="sidebar-section">
      <div class="section-header" @click="tagsOpen = !tagsOpen">
        <span class="section-arrow">{{ tagsOpen ? '&#9660;' : '&#9654;' }}</span>
        <span>Tags</span>
        <span class="section-count">{{ allTags.length }}</span>
      </div>
      <div v-if="tagsOpen" class="section-content tags-list">
        <button
          v-if="activeTag"
          @click="$emit('set-tag', null)"
          class="tag-item tag-active"
        >
          {{ activeTag }} &times;
        </button>
        <button
          v-for="tag in allTags"
          :key="tag"
          @click="$emit('set-tag', activeTag === tag ? null : tag)"
          class="tag-item"
          :class="{ 'tag-active': activeTag === tag }"
        >
          {{ tag }}
        </button>
      </div>
    </div>

    <!-- Templates Section -->
    <div class="sidebar-section" v-if="templates.length > 0">
      <div class="section-header" @click="templatesOpen = !templatesOpen">
        <span class="section-arrow">{{ templatesOpen ? '&#9660;' : '&#9654;' }}</span>
        <span>Vorlagen</span>
        <span class="section-count">{{ templates.length }}</span>
      </div>
      <div v-if="templatesOpen" class="section-content">
        <div
          v-for="tmpl in templates"
          :key="tmpl.filename"
          @click="$emit('select', tmpl.filename)"
          class="note-item"
          :class="{ active: selectedFilename === tmpl.filename }"
        >
          {{ tmpl.frontmatter.template_name || tmpl.title }}
        </div>
      </div>
    </div>

    <!-- Tasks Section -->
    <div class="sidebar-section" v-if="tasks.length > 0">
      <div class="section-header" @click="tasksOpen = !tasksOpen">
        <span class="section-arrow">{{ tasksOpen ? '&#9660;' : '&#9654;' }}</span>
        <span>Aufgaben</span>
        <span class="section-count">{{ openTasks.length }}</span>
      </div>
      <div v-if="tasksOpen" class="section-content">
        <div
          v-for="task in openTasks"
          :key="task.filename"
          class="note-item task-item"
          :class="{ active: selectedFilename === task.filename }"
        >
          <input
            type="checkbox"
            :checked="task.frontmatter.status === 'done'"
            @change.stop="$emit('toggle-task-done', task)"
            class="task-checkbox"
          />
          <span
            class="task-dot"
            :class="'dot-' + getTaskColor(task)"
          ></span>
          <span class="note-title" @click="$emit('select', task.filename)">{{ task.title }}</span>
        </div>
      </div>
    </div>

    <!-- Notes List -->
    <div class="sidebar-section notes-section">
      <div class="section-header">
        <span>Notizen</span>
        <span class="section-count">{{ filteredRegularNotes.length }}</span>
      </div>
      <div class="section-content notes-list">
        <div
          v-for="note in filteredRegularNotes"
          :key="note.filename"
          @click="$emit('select', note.filename)"
          class="note-item"
          :class="{ active: selectedFilename === note.filename }"
        >
          <span v-if="note.frontmatter?.type === 'task'" class="task-dot" :class="'dot-' + getTaskColor(note)"></span>
          <span class="note-title">{{ note.title }}</span>
          <span class="note-tags" v-if="note.frontmatter?.tags?.length">
            {{ note.frontmatter.tags.slice(0, 2).join(', ') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Version Footer -->
    <div class="sidebar-footer">
      NoteHub v{{ appVersion }} · Build {{ buildDate }}
    </div>

    <!-- Resize Handle -->
    <div class="resize-handle" @mousedown="startResize"></div>
  </aside>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  notes: Array,
  allTags: Array,
  templates: Array,
  tasks: Array,
  selectedFilename: String,
  searchQuery: String,
  activeTag: String,
  getTaskColor: Function
});

defineEmits(['select', 'search', 'set-tag', 'new-note', 'new-task', 'new-from-template', 'toggle-task-done']);

const appVersion = __APP_VERSION__;
const buildDate = (() => {
  const d = new Date(__BUILD_DATE__);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
})();

const sidebarWidth = ref(280);
const tagsOpen = ref(false);
const templatesOpen = ref(false);
const tasksOpen = ref(true);
const showNewMenu = ref(false);

const openTasks = computed(() => {
  return props.tasks.filter(t => t.frontmatter?.status !== 'done');
});

const filteredRegularNotes = computed(() => {
  return props.notes.filter(n => n.frontmatter?.type !== 'task');
});

function startResize(e) {
  const startX = e.clientX;
  const startWidth = sidebarWidth.value;
  function onMove(e) {
    sidebarWidth.value = Math.max(200, Math.min(500, startWidth + e.clientX - startX));
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
</script>
