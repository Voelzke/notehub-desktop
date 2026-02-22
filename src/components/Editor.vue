<template>
  <main class="editor">
    <!-- Toolbar -->
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <button @click="previewMode = !previewMode" class="toolbar-btn" :class="{ active: previewMode }">
          {{ previewMode ? 'Bearbeiten' : 'Vorschau' }}
        </button>
        <template v-if="!previewMode">
          <span class="toolbar-sep"></span>
          <button @click="insertMarkdown('**', '**')" title="Fett (Ctrl+B)" class="toolbar-btn"><b>B</b></button>
          <button @click="insertMarkdown('*', '*')" title="Kursiv (Ctrl+I)" class="toolbar-btn"><i>I</i></button>
          <button @click="insertMarkdown('~~', '~~')" title="Durchgestrichen" class="toolbar-btn"><s>S</s></button>
          <span class="toolbar-sep"></span>
          <button @click="insertLine('# ')" title="H1" class="toolbar-btn">H1</button>
          <button @click="insertLine('## ')" title="H2" class="toolbar-btn">H2</button>
          <button @click="insertLine('### ')" title="H3" class="toolbar-btn">H3</button>
          <span class="toolbar-sep"></span>
          <button @click="insertBlock('---')" title="Linie" class="toolbar-btn">&mdash;</button>
          <button @click="insertLine('- ')" title="Liste" class="toolbar-btn">&#8226;</button>
          <button @click="insertLine('- [ ] ')" title="Checkbox" class="toolbar-btn">&#9744;</button>
          <span class="toolbar-sep"></span>
          <button @click="insertDate" title="Datum einfügen" class="toolbar-btn">&#128197;</button>
          <button @click="insertTime" title="Zeit einfügen" class="toolbar-btn">&#128339;</button>
          <button @click="insertLink" title="Link einfügen" class="toolbar-btn">&#128279;</button>
          <button @click="pickImage" title="Bild einfügen" class="toolbar-btn">&#128206;</button>
        </template>
      </div>
      <div class="toolbar-right" v-if="!previewMode">
        <button
          @click="$emit('toggle-template')"
          class="toolbar-btn"
          :class="{ active: note.frontmatter?.template }"
          :title="note.frontmatter?.template ? 'Vorlage entfernen' : 'Als Vorlage speichern'"
        >
          {{ note.frontmatter?.template ? 'Vorlage entfernen' : 'Als Vorlage' }}
        </button>
        <button
          @click="$emit('toggle-task')"
          class="toolbar-btn"
          :class="{ active: note.frontmatter?.type === 'task' }"
          :title="note.frontmatter?.type === 'task' ? 'Aufgabe entfernen' : 'Als Aufgabe markieren'"
        >
          {{ note.frontmatter?.type === 'task' ? 'Aufgabe entfernen' : 'Als Aufgabe' }}
        </button>
        <button @click="$emit('save')" class="toolbar-btn btn-save" :disabled="saveLock" title="Speichern">
          &#128190;
        </button>
        <button @click="$emit('delete')" class="toolbar-btn btn-delete" title="Löschen">
          &#128465;
        </button>
      </div>
    </div>

    <!-- Title -->
    <input
      class="editor-title"
      :value="note.title"
      @change="$emit('rename', $event.target.value)"
      placeholder="Titel..."
    />

    <!-- Tags -->
    <TagInput
      :tags="note.frontmatter?.tags || []"
      :all-tags="allTags"
      @update="updateTags"
    />

    <!-- Contacts -->
    <ContactInput
      :contacts="note.frontmatter?.contacts || []"
      :all-contacts="allContacts"
      @update="updateContacts"
    />

    <!-- Task Bar -->
    <TaskBar
      :note="note"
      @update-frontmatter="$emit('update-frontmatter', $event)"
    />

    <!-- Textarea / Preview -->
    <div class="editor-body-wrapper">
      <!-- Preview Mode -->
      <div v-if="previewMode" class="editor-preview" v-html="renderedMarkdown" @click="onPreviewClick"></div>

      <!-- Edit Mode -->
      <template v-else>
        <textarea
          ref="textareaRef"
          class="editor-textarea"
          :value="note.body"
          @input="onBodyInput"
          @keydown="onKeydown"
          @click="onTextareaClick"
          @scroll="closeAutocomplete"
          @paste="onPaste"
          placeholder="Schreibe hier..."
        ></textarea>

        <!-- Wikilink Autocomplete -->
        <div
          v-if="showWikiComplete"
          class="wiki-autocomplete"
          :style="{ top: wikiCompletePos.top + 'px', left: wikiCompletePos.left + 'px' }"
        >
          <div
            v-for="(match, i) in wikiMatches"
            :key="match.filename"
            @mousedown.prevent="insertWikilink(match.title)"
            class="wiki-match"
            :class="{ active: i === wikiSelectedIndex }"
          >
            {{ match.title }}
          </div>
        </div>
      </template>
    </div>

    <!-- Backlinks -->
    <div class="backlinks-section" v-if="backlinks.length > 0">
      <div class="section-header" @click="backlinksOpen = !backlinksOpen">
        <span class="section-arrow">{{ backlinksOpen ? '&#9660;' : '&#9654;' }}</span>
        <span>Backlinks</span>
        <span class="section-count">{{ backlinks.length }}</span>
      </div>
      <div v-if="backlinksOpen" class="backlinks-list">
        <div
          v-for="bl in backlinks"
          :key="bl.filename + ':' + bl.line"
          @click="$emit('navigate', bl.title)"
          class="backlink-item"
        >
          <span class="backlink-title">{{ bl.title }}</span>
          <span class="backlink-line">Zeile {{ bl.line }}</span>
          <span class="backlink-context">{{ bl.context }}</span>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import MarkdownIt from 'markdown-it';
import TagInput from './TagInput.vue';
import ContactInput from './ContactInput.vue';
import TaskBar from './TaskBar.vue';

const props = defineProps({
  note: Object,
  allTags: Array,
  allContacts: Array,
  allNotes: Array,
  notesPath: String,
  backlinks: Array,
  saveLock: Boolean
});

const emit = defineEmits(['update-body', 'update-frontmatter', 'rename', 'save', 'delete', 'navigate', 'toggle-task', 'toggle-template']);

// --- Markdown-it setup ---
const md = new MarkdownIt({ html: true, linkify: true, breaks: true });

// Wikilink plugin
md.inline.ruler.push('wikilink', (state, silent) => {
  if (state.src.charCodeAt(state.pos) !== 0x5B) return false;
  if (state.src.charCodeAt(state.pos + 1) !== 0x5B) return false;
  const start = state.pos + 2;
  const end = state.src.indexOf(']]', start);
  if (end === -1) return false;
  const content = state.src.slice(start, end);
  if (!content || content.includes('\n')) return false;
  if (!silent) {
    const token = state.push('wikilink', '', 0);
    token.content = content;
  }
  state.pos = end + 2;
  return true;
});

md.renderer.rules.wikilink = (tokens, idx) => {
  const title = md.utils.escapeHtml(tokens[idx].content);
  return `<a class="wikilink" data-title="${title}">${title}</a>`;
};

// Custom image renderer: resolve relative paths via notehub:// protocol
const defaultImageRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options);
};
md.renderer.rules.image = function(tokens, idx, options, env, self) {
  const token = tokens[idx];
  const src = token.attrGet('src');
  if (src && !/^(https?:|data:|notehub:|file:)/.test(src)) {
    token.attrSet('src', `notehub://local/${src}`);
  }
  return defaultImageRender(tokens, idx, options, env, self);
};

// --- Refs ---
const textareaRef = ref(null);
const backlinksOpen = ref(false);
const previewMode = ref(false);
const showWikiComplete = ref(false);
const wikiCompletePos = ref({ top: 0, left: 0 });
const wikiQuery = ref('');
const wikiSelectedIndex = ref(0);
const wikiMatches = ref([]);
const wikiStartPos = ref(0);

// --- Preview ---
const renderedMarkdown = computed(() => {
  if (!props.note?.body) return '';
  let html = md.render(props.note.body);
  // Checkboxes
  html = html.replace(/<li>\s*\[ \]\s*/g, '<li class="task-list-item"><input type="checkbox" disabled> ');
  html = html.replace(/<li>\s*\[x\]\s*/gi, '<li class="task-list-item"><input type="checkbox" disabled checked> ');
  return html;
});

function onPreviewClick(e) {
  const link = e.target.closest('.wikilink');
  if (link) {
    e.preventDefault();
    const title = link.dataset.title;
    if (title) emit('navigate', title);
  }
}

// --- Image paste ---
async function onPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const blob = item.getAsFile();
      const arrayBuffer = await blob.arrayBuffer();
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const filename = `img_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
      const result = await window.api.saveImage({ buffer: new Uint8Array(arrayBuffer), filename });
      if (result.success) {
        insertAtCursor(`![Bild](${result.path})`);
      }
      return;
    }
  }
}

async function pickImage() {
  const result = await window.api.pickImage();
  if (result.success) {
    insertAtCursor(`![Bild](${result.path})`);
  }
}

function insertAtCursor(text) {
  const textarea = textareaRef.value;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const newValue = value.substring(0, start) + text + value.substring(end);
  emit('update-body', newValue);
  nextTick(() => {
    const newPos = start + text.length;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
  });
}

// --- Body input ---
function onBodyInput(e) {
  emit('update-body', e.target.value);
  checkWikilink(e.target);
}

// --- Wikilink autocomplete ---
function checkWikilink(textarea) {
  const pos = textarea.selectionStart;
  const text = textarea.value.substring(0, pos);
  const match = text.match(/\[\[([^\]]*?)$/);

  if (match) {
    wikiQuery.value = match[1];
    wikiStartPos.value = pos - match[1].length;
    const q = match[1].toLowerCase();
    wikiMatches.value = props.allNotes
      .filter(n => !n.frontmatter?.template && n.title.toLowerCase().includes(q))
      .slice(0, 10);

    if (wikiMatches.value.length > 0) {
      const rect = textarea.getBoundingClientRect();
      const lineHeight = 20;
      const lines = text.split('\n');
      const currentLine = lines.length;
      const scrollTop = textarea.scrollTop;

      wikiCompletePos.value = {
        top: Math.min(currentLine * lineHeight - scrollTop + 4, rect.height - 200),
        left: Math.min(lines[lines.length - 1].length * 8, rect.width - 200)
      };
      showWikiComplete.value = true;
      wikiSelectedIndex.value = 0;
    } else {
      showWikiComplete.value = false;
    }
  } else {
    showWikiComplete.value = false;
  }
}

function insertWikilink(title) {
  const textarea = textareaRef.value;
  if (!textarea) return;

  const before = textarea.value.substring(0, wikiStartPos.value);
  const after = textarea.value.substring(textarea.selectionStart);
  const newValue = before + title + ']]' + after;

  emit('update-body', newValue);
  showWikiComplete.value = false;

  nextTick(() => {
    const newPos = wikiStartPos.value + title.length + 2;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
  });
}

function closeAutocomplete() {
  showWikiComplete.value = false;
}

function onKeydown(e) {
  if (showWikiComplete.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      wikiSelectedIndex.value = Math.min(wikiSelectedIndex.value + 1, wikiMatches.value.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      wikiSelectedIndex.value = Math.max(wikiSelectedIndex.value - 1, 0);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (wikiMatches.value[wikiSelectedIndex.value]) {
        insertWikilink(wikiMatches.value[wikiSelectedIndex.value].title);
      }
    } else if (e.key === 'Escape') {
      showWikiComplete.value = false;
    }
    return;
  }

  // Keyboard shortcuts
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'b') {
      e.preventDefault();
      insertMarkdown('**', '**');
    } else if (e.key === 'i') {
      e.preventDefault();
      insertMarkdown('*', '*');
    } else if (e.key === 's') {
      e.preventDefault();
      emit('save');
    }
  }
}

function onTextareaClick(e) {
  if (e.ctrlKey || e.metaKey) {
    const textarea = e.target;
    const pos = textarea.selectionStart;
    const text = textarea.value;

    const before = text.substring(0, pos);
    const after = text.substring(pos);
    const openIdx = before.lastIndexOf('[[');
    const closeBeforeIdx = before.lastIndexOf(']]');

    if (openIdx > closeBeforeIdx) {
      const closeIdx = after.indexOf(']]');
      if (closeIdx >= 0) {
        const linkTitle = text.substring(openIdx + 2, pos + closeIdx);
        emit('navigate', linkTitle);
      }
    }
  }
}

// --- Formatting helpers ---
function insertMarkdown(prefix, suffix) {
  const textarea = textareaRef.value;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);

  const newText = text.substring(0, start) + prefix + (selected || 'Text') + suffix + text.substring(end);
  emit('update-body', newText);

  nextTick(() => {
    if (selected) {
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    } else {
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + 4);
    }
    textarea.focus();
  });
}

function insertLine(prefix) {
  const textarea = textareaRef.value;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const text = textarea.value;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const newText = text.substring(0, lineStart) + prefix + text.substring(lineStart);
  emit('update-body', newText);
  nextTick(() => {
    textarea.setSelectionRange(start + prefix.length, start + prefix.length);
    textarea.focus();
  });
}

function insertBlock(block) {
  const textarea = textareaRef.value;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const text = textarea.value;
  const insert = '\n' + block + '\n';
  const newText = text.substring(0, start) + insert + text.substring(start);
  emit('update-body', newText);
  nextTick(() => {
    textarea.setSelectionRange(start + insert.length, start + insert.length);
    textarea.focus();
  });
}

function insertDate() {
  const date = new Date().toISOString().slice(0, 10);
  insertAtCursor(date);
}

function insertTime() {
  const time = new Date().toTimeString().slice(0, 5);
  insertAtCursor(time);
}

function insertLink() {
  insertMarkdown('[', '](url)');
}

function updateTags(newTags) {
  const fm = { ...props.note.frontmatter, tags: newTags };
  emit('update-frontmatter', fm);
}

function updateContacts(newContacts) {
  const fm = { ...props.note.frontmatter };
  if (newContacts.length > 0) {
    fm.contacts = newContacts;
  } else {
    delete fm.contacts;
  }
  emit('update-frontmatter', fm);
}
</script>
