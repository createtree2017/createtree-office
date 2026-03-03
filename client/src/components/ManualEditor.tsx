import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

interface ManualEditorProps {
    initialContent: string;
    onSave: (content: string) => Promise<void>;
    editable: boolean;
}

const ManualEditor = ({ initialContent, onSave, editable }: ManualEditorProps) => {
    const [isSaving, setIsSaving] = useState(false);

    const editor = useEditor({
        extensions: [
            StarterKit,
            Placeholder.configure({
                placeholder: '내용을 입력하세요...',
            }),
        ],
        content: initialContent,
        editable: editable,
        onBlur: async ({ editor }) => {
            if (!editable) return;

            const html = editor.getHTML();
            if (html === initialContent) return;

            setIsSaving(true);
            try {
                await onSave(html);
                toast.success('자동 저장되었습니다.');
            } catch (error) {
                toast.error('저장에 실패했습니다.');
            } finally {
                setIsSaving(false);
            }
        },
    });

    useEffect(() => {
        if (editor && initialContent !== editor.getHTML()) {
            editor.commands.setContent(initialContent);
        }
    }, [initialContent, editor]);

    if (!editor) return null;

    return (
        <div className="relative group">
            {isSaving && (
                <div className="absolute top-0 right-0 p-2 text-xs text-blue-400 animate-pulse">
                    Saving...
                </div>
            )}
            <div className={`prose prose-invert max-w-none min-h-[200px] p-4 rounded-xl transition-all ${editable ? 'cursor-text hover:bg-slate-900/50' : 'cursor-default'
                }`}>
                <EditorContent editor={editor} />
            </div>
        </div>
    );
};

export default ManualEditor;
