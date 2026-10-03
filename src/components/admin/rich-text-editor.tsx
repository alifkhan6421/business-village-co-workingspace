"use client";
import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo, Undo, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Small WYSIWYG editor. Writes its HTML into a hidden input named `name`;
 * the server sanitizes it again before storing.
 */
export function RichTextEditor({
  name,
  defaultValue = "",
  id,
  minimal = false,
  onChange,
}: {
  name: string;
  defaultValue?: string;
  id?: string;
  minimal?: boolean;
  onChange?: (html: string) => void;
}) {
  const [html, setHtml] = useState(defaultValue);
  const t = useTranslations("admin.editor");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: { openOnClick: false, autolink: true, protocols: ["https", "mailto", "tel"], HTMLAttributes: { rel: null, target: null } },
      }),
    ],
    content: defaultValue,
    editorProps: {
      attributes: {
        class: "prose-bv text-sm min-h-[8rem] px-3 py-2 focus:outline-none",
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => {
      const value = editor.isEmpty ? "" : editor.getHTML();
      setHtml(value);
      onChange?.(value);
    },
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  const btn = (active: boolean) =>
    cn("rounded p-1.5 hover:bg-muted disabled:opacity-40", active && "bg-muted text-primary");

  const setLink = () => {
    if (!editor) return;
    const prev = (editor.getAttributes("link").href as string) ?? "";
    const url = window.prompt(t("linkPrompt"), prev || "https://");
    if (url === null) return;
    if (url === "" || url === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^(https:\/\/|mailto:|tel:|\/)/.test(url)) {
      window.alert(t("linkInvalid"));
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
      <input type="hidden" name={name} value={html} />
      <div className="flex flex-wrap gap-0.5 border-b px-1.5 py-1 text-muted-foreground" role="toolbar">
        <button type="button" title={t("bold")} aria-label={t("bold")} className={btn(!!editor?.isActive("bold"))} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" title={t("italic")} aria-label={t("italic")} className={btn(!!editor?.isActive("italic"))} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </button>
        {!minimal ? (
          <>
            <button type="button" title={t("h2")} aria-label={t("h2")} className={btn(!!editor?.isActive("heading", { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 className="h-4 w-4" />
            </button>
            <button type="button" title={t("h3")} aria-label={t("h3")} className={btn(!!editor?.isActive("heading", { level: 3 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
              <Heading3 className="h-4 w-4" />
            </button>
          </>
        ) : null}
        <button type="button" title={t("bulletList")} aria-label={t("bulletList")} className={btn(!!editor?.isActive("bulletList"))} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </button>
        <button type="button" title={t("orderedList")} aria-label={t("orderedList")} className={btn(!!editor?.isActive("orderedList"))} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </button>
        {!minimal ? (
          <button type="button" title={t("quote")} aria-label={t("quote")} className={btn(!!editor?.isActive("blockquote"))} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
            <Quote className="h-4 w-4" />
          </button>
        ) : null}
        <button type="button" title={t("link")} aria-label={t("link")} className={btn(!!editor?.isActive("link"))} onClick={setLink}>
          <Link2 className="h-4 w-4" />
        </button>
        <button type="button" title={t("unlink")} aria-label={t("unlink")} className={btn(false)} disabled={!editor?.isActive("link")} onClick={() => editor?.chain().focus().unsetLink().run()}>
          <Unlink className="h-4 w-4" />
        </button>
        <span className="mx-1 w-px bg-border" />
        <button type="button" title={t("undo")} aria-label={t("undo")} className={btn(false)} onClick={() => editor?.chain().focus().undo().run()}>
          <Undo className="h-4 w-4" />
        </button>
        <button type="button" title={t("redo")} aria-label={t("redo")} className={btn(false)} onClick={() => editor?.chain().focus().redo().run()}>
          <Redo className="h-4 w-4" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
