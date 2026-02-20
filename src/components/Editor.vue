<template>
  <main class="editor">
    <!-- Toolbar -->
    <div class="editor-toolbar">
      <div class="toolbar-left">
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
      </div>
      <div class="toolbar-right">
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
        <button @click="console.log('[Editor] save clicked'); $emit('save')" class="toolbar-btn btn-save" :disabled="saveLock" title="Speichern">
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

    <!-- Task Bar -->
    <TaskBar
      :note="note"
      @update-frontmatter="$emit('update-frontmatter', $event)"
    />

    <!-- Textarea with Wikilink Autocomplete -->
    <div class="editor-body-wrapper">
      <textarea
        ref="textareaRef"
        class="editor-textarea"
        :value="note.body"
        @input="onBodyInput"
        @keydown="onKeydown"
        @click="onTextareaClick"
        @scroll="closeAutocomplete"
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
import { ref, watch, nextTick } from 'vue';
import TagInput from './TagInput.vue';
import TaskBar from './TaskBar.vue';

const props = defineProps({
  note: Object,
  allTags: Array,
  allNotes: Array,
  backlinks: Array,
  saveLock: Boolean
});

const emit = defineEmits(['update-body', 'update-frontmatter', 'rename', 'save', 'delete', 'navigate', 'toggle-task', 'toggle-template']);

const textareaRef = ref(null);
const backlinksOpen = ref(false);
const showWikiComplete = ref(false);
const wikiCompletePos = ref({ top: 0, left: 0 });
const wikiQuery = ref('');
const wikiSelectedIndex = ref(0);
const wikiMatches = ref([]);
const wikiStartPos = ref(0);

function onBodyInput(e) {
  console.log('[Editor] onBodyInput, length:', e.target.value.length);
  emit('update-body', e.target.value);
  checkWikilink(e.target);
}

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
      // Position the autocomplete near cursor
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
  // Ctrl+Click on wikilinks
  if (e.ctrlKey || e.metaKey) {
    const textarea = e.target;
    const pos = textarea.selectionStart;
    const text = textarea.value;

    // Find if click position is inside [[ ... ]]
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

  // Find the beginning of the current line
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
  const textarea = textareaRef.value;
  if (!textarea) return;
  const date = new Date().toISOString().slice(0, 10);
  const start = textarea.selectionStart;
  const text = textarea.value;
  const newText = text.substring(0, start) + date + text.substring(textarea.selectionEnd);
  emit('update-body', newText);

  nextTick(() => {
    textarea.setSelectionRange(start + date.length, start + date.length);
    textarea.focus();
  });
}

function insertTime() {
  const textarea = textareaRef.value;
  if (!textarea) return;
  const time = new Date().toTimeString().slice(0, 5);
  const start = textarea.selectionStart;
  const text = textarea.value;
  const newText = text.substring(0, start) + time + text.substring(textarea.selectionEnd);
  emit('update-body', newText);

  nextTick(() => {
    textarea.setSelectionRange(start + time.length, start + time.length);
    textarea.focus();
  });
}

function insertLink() {
  insertMarkdown('[', '](url)');
}

function updateTags(newTags) {
  const fm = { ...props.note.frontmatter, tags: newTags };
  emit('update-frontmatter', fm);
}
</script>
