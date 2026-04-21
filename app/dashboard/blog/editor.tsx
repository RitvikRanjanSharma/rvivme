"use client";

// app/dashboard/blog/editor.tsx
// =============================================================================
// AI Marketing Lab — TipTap Rich Text Editor
// Full toolbar · Auto-save indicator · Word/char count · SEO-ready HTML output
// =============================================================================

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import CodeBlock from "@tiptap/extension-code-block";
import { useEffect, useCallback } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Code, Link as LinkIcon, Undo, Redo,
  Minus, WrapText,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface EditorProps {
  content:    string;
  onChange:   (html: string) => void;
  brandColor: string;
  placeholder?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar button
// ─────────────────────────────────────────────────────────────────────────────
function ToolbarButton({
  onClick, active = false, disabled = false, title, children, brandColor,
}: {
  onClick:    () => void;
  active?:    boolean;
  disabled?:  boolean;
  title:      string;
  children:   React.ReactNode;
  brandColor: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      style={{
        width:        "28px",
        height:       "28px",
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
        borderRadius: "5px",
        border:       "none",
        cursor:       disabled ? "not-allowed" : "pointer",
        background:   active ? `rgba(var(--brand-rgb), 0.15)` : "transparent",
        color:        active ? brandColor : disabled ? "var(--text-tertiary)" : "var(--text-secondary)",
        transition:   "all 0.15s",
        flexShrink:   0,
      }}
      onMouseEnter={e => {
        if (!disabled && !active) {
          (e.currentTarget as HTMLElement).style.background = "var(--card)";
          (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={e => {
        if (!disabled && !active) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
        }
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: "1px", height: "20px", background: "var(--border)", margin: "0 4px", flexShrink: 0 }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main editor
// ─────────────────────────────────────────────────────────────────────────────
export function RichTextEditor({ content, onChange, brandColor, placeholder = "Start writing your post..." }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      CodeBlock.configure({ HTMLAttributes: { class: "code-block" } }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    content: content || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "tiptap-editor",
        spellcheck: "true",
      },
    },
  });

  // Sync external content changes (e.g. loading a post)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || "");
    }
  }, [content, editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Enter URL:");
    if (!url) return;
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  const words = editor.storage.characterCount.words();
  const chars = editor.storage.characterCount.characters();

  return (
    <div style={{
      background:   "var(--card)",
      border:       "1px solid var(--border)",
      borderRadius: "10px",
      overflow:     "hidden",
    }}>
      {/* Toolbar */}
      <div style={{
        display:     "flex",
        alignItems:  "center",
        flexWrap:    "wrap",
        gap:         "2px",
        padding:     "8px 10px",
        borderBottom: "1px solid var(--border)",
        background:  "var(--surface)",
      }}>
        {/* History */}
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)" brandColor={brandColor}><Undo size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)" brandColor={brandColor}><Redo size={13} /></ToolbarButton>

        <Divider />

        {/* Headings */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1" brandColor={brandColor}><Heading1 size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2" brandColor={brandColor}><Heading2 size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3" brandColor={brandColor}><Heading3 size={13} /></ToolbarButton>

        <Divider />

        {/* Inline formatting */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()}          active={editor.isActive("bold")}          title="Bold (Ctrl+B)"      brandColor={brandColor}><Bold size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()}        active={editor.isActive("italic")}        title="Italic (Ctrl+I)"    brandColor={brandColor}><Italic size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()}     active={editor.isActive("underline")}     title="Underline (Ctrl+U)" brandColor={brandColor}><UnderlineIcon size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()}        active={editor.isActive("strike")}        title="Strikethrough"      brandColor={brandColor}><Strikethrough size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()}          active={editor.isActive("code")}          title="Inline Code"        brandColor={brandColor}><Code size={13} /></ToolbarButton>

        <Divider />

        {/* Lists */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()}    active={editor.isActive("bulletList")}    title="Bullet List"        brandColor={brandColor}><List size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()}   active={editor.isActive("orderedList")}   title="Numbered List"      brandColor={brandColor}><ListOrdered size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()}    active={editor.isActive("blockquote")}    title="Blockquote"         brandColor={brandColor}><Quote size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()}     active={editor.isActive("codeBlock")}     title="Code Block"         brandColor={brandColor}><WrapText size={13} /></ToolbarButton>

        <Divider />

        {/* Link + HR */}
        <ToolbarButton onClick={addLink} active={editor.isActive("link")} title="Add Link" brandColor={brandColor}><LinkIcon size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule" brandColor={brandColor}><Minus size={13} /></ToolbarButton>

        {/* Word count */}
        <div style={{ marginLeft: "auto", display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
            {words} words · {chars} chars
          </span>
        </div>
      </div>

      {/* Editor area */}
      <div style={{ padding: "20px 24px", minHeight: "320px" }}>
        <EditorContent editor={editor} />
      </div>

      {/* Editor styles */}
      <style>{`
        .tiptap-editor {
          outline: none;
          font-family: var(--font-inter), sans-serif;
          font-size: 14px;
          line-height: 1.8;
          color: var(--text-primary);
          min-height: 280px;
        }
        .tiptap-editor p { margin: 0 0 12px; }
        .tiptap-editor p:last-child { margin-bottom: 0; }
        .tiptap-editor h1 { font-family: var(--font-display); font-size: 2rem; font-weight: 800; letter-spacing: -0.05em; line-height: 1.1; margin: 24px 0 12px; color: var(--text-primary); }
        .tiptap-editor h2 { font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; letter-spacing: -0.04em; line-height: 1.2; margin: 20px 0 10px; color: var(--text-primary); }
        .tiptap-editor h3 { font-family: var(--font-display); font-size: 1.2rem; font-weight: 700; letter-spacing: -0.03em; line-height: 1.3; margin: 16px 0 8px; color: var(--text-primary); }
        .tiptap-editor strong { font-weight: 700; color: var(--text-primary); }
        .tiptap-editor em { font-style: italic; }
        .tiptap-editor u { text-decoration: underline; }
        .tiptap-editor s { text-decoration: line-through; color: var(--text-secondary); }
        .tiptap-editor code { font-family: var(--font-mono); font-size: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; color: var(--brand); }
        .tiptap-editor pre { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; overflow-x: auto; margin: 12px 0; }
        .tiptap-editor pre code { background: none; border: none; padding: 0; color: var(--text-primary); font-size: 13px; }
        .tiptap-editor blockquote { border-left: 3px solid var(--brand); margin: 12px 0; padding: 8px 16px; color: var(--text-secondary); font-style: italic; background: rgba(var(--brand-rgb), 0.04); border-radius: 0 6px 6px 0; }
        .tiptap-editor ul { padding-left: 20px; margin: 8px 0 12px; }
        .tiptap-editor ol { padding-left: 20px; margin: 8px 0 12px; }
        .tiptap-editor li { margin-bottom: 4px; color: var(--text-secondary); }
        .tiptap-editor a { color: var(--brand); text-decoration: underline; text-underline-offset: 2px; }
        .tiptap-editor hr { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
        .tiptap-editor .is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--text-tertiary); pointer-events: none; float: left; height: 0; font-style: italic; }
        .tiptap-editor p.is-empty::before { content: attr(data-placeholder); color: var(--text-tertiary); pointer-events: none; float: left; height: 0; font-style: italic; }
      `}</style>
    </div>
  );
}