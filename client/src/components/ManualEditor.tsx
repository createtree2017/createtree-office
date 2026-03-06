import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
    Bold, Italic, List, ListOrdered, CheckSquare,
    Type, Highlighter, Underline as UnderlineIcon,
    Code, Quote
} from 'lucide-react';

interface ManualEditorProps {
    initialContent: string;
    googleFormId?: string | null;
    onSave: (content: string, googleFormId?: string | null) => Promise<void>;
    editable: boolean;
}

const ManualEditor = ({ initialContent, googleFormId, onSave, editable }: ManualEditorProps) => {
    const [isSaving, setIsSaving] = useState(false);
    const [showToolbar, setShowToolbar] = useState(false);
    const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });
    const [googleForms, setGoogleForms] = useState<{ id: string, name: string }[]>([]);
    const [isLoadingForms, setIsLoadingForms] = useState(false);
    const toolbarRef = useRef<HTMLDivElement>(null);

    // GAS_URL은 사용자가 나중에 구성할 수 있도록 안내 필요
    // 여기서는 환경 변수나 고정된 문자열을 사용할 수 있음
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbz8y4b4VED1HVkF1SzVi0FX0Z4LPSbJFgUiPHrFphxpNrw7mSlCb0bB0OFx2OSgwf0Hkw/exec';

    const fetchGoogleForms = async () => {
        if (!editable || GAS_URL === 'YOUR_GAS_WEB_APP_URL') return;
        setIsLoadingForms(true);
        try {
            const response = await fetch(GAS_URL);
            const data = await response.json();
            setGoogleForms(data);
        } catch (error) {
            console.error('Failed to fetch google forms:', error);
        } finally {
            setIsLoadingForms(false);
        }
    };

    useEffect(() => {
        if (editable && GAS_URL !== 'YOUR_GAS_WEB_APP_URL') {
            fetchGoogleForms();
        }
    }, [editable]);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Typography 확장과 충돌하는 기능 비활성화
                // (StarterKit은 Underline을 포함하지 않으므로 별도 추가는 정상)
            }),
            Placeholder.configure({
                placeholder: '내용을 입력하세요...',
            }),
            TaskList,
            TaskItem.configure({
                nested: true,
            }),
            Highlight,
            // Typography는 StarterKit의 일부 mark와 이름이 겹칠 수 있어 제거
            Underline,
        ],
        content: initialContent,
        immediatelyRender: false,
        editable: editable,
        onSelectionUpdate: ({ editor }) => {
            if (!editable) return;
            const { from, to } = editor.state.selection;
            if (from === to) {
                setShowToolbar(false);
                return;
            }
            // Calculate position for inline toolbar
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const editorEl = document.querySelector('.tiptap-editor-wrap');
                if (editorEl) {
                    const editorRect = editorEl.getBoundingClientRect();
                    setToolbarPos({
                        top: rect.top - editorRect.top - 48,
                        left: rect.left - editorRect.left + rect.width / 2,
                    });
                    setShowToolbar(true);
                }
            }
        },
        onBlur: async ({ editor }) => {
            if (!editable) return;
            setShowToolbar(false);

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
        <div className="relative group min-h-[400px] tiptap-editor-wrap">
            {isSaving && (
                <div className="absolute top-0 right-0 p-2 text-xs text-blue-400 animate-pulse z-10">
                    Saving...
                </div>
            )}

            {/* Inline Bubble-style Toolbar */}
            {showToolbar && editable && (
                <div
                    ref={toolbarRef}
                    className="absolute z-50 flex bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-x divide-slate-700"
                    style={{
                        top: `${toolbarPos.top}px`,
                        left: `${toolbarPos.left}px`,
                        transform: 'translateX(-50%)',
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-2 hover:bg-slate-700 transition-colors ${editor.isActive('bold') ? 'text-blue-400 bg-slate-700' : 'text-slate-300'}`}><Bold size={14} /></button>
                    <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-2 hover:bg-slate-700 transition-colors ${editor.isActive('italic') ? 'text-blue-400 bg-slate-700' : 'text-slate-300'}`}><Italic size={14} /></button>
                    <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`p-2 hover:bg-slate-700 transition-colors ${editor.isActive('underline') ? 'text-blue-400 bg-slate-700' : 'text-slate-300'}`}><UnderlineIcon size={14} /></button>
                    <button onClick={() => editor.chain().focus().toggleHighlight().run()} className={`p-2 hover:bg-slate-700 transition-colors ${editor.isActive('highlight') ? 'text-blue-400 bg-slate-700' : 'text-slate-300'}`}><Highlighter size={14} /></button>
                    <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-2 hover:bg-slate-700 transition-colors ${editor.isActive('heading', { level: 2 }) ? 'text-blue-400 bg-slate-700' : 'text-slate-300'}`}><Type size={14} /></button>
                    <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-2 hover:bg-slate-700 transition-colors ${editor.isActive('bulletList') ? 'text-blue-400 bg-slate-700' : 'text-slate-300'}`}><List size={14} /></button>
                    <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={`p-2 hover:bg-slate-700 transition-colors ${editor.isActive('taskList') ? 'text-blue-400 bg-slate-700' : 'text-slate-300'}`}><CheckSquare size={14} /></button>
                </div>
            )}

            {/* Fixed Toolbar for editing */}
            {editable && (
                <div className="flex flex-wrap gap-1 mb-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                    <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-2 rounded-xl text-sm hover:bg-white dark:hover:bg-slate-700 transition-all ${editor.isActive('bold') ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}><Bold size={15} /></button>
                    <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-2 rounded-xl text-sm hover:bg-white dark:hover:bg-slate-700 transition-all ${editor.isActive('italic') ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}><Italic size={15} /></button>
                    <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`p-2 rounded-xl text-sm hover:bg-white transition-all ${editor.isActive('underline') ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><UnderlineIcon size={15} /></button>
                    <button onClick={() => editor.chain().focus().toggleHighlight().run()} className={`p-2 rounded-xl text-sm hover:bg-white transition-all ${editor.isActive('highlight') ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Highlighter size={15} /></button>
                    <div className="w-px bg-slate-200 mx-1 self-stretch" />
                    <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-white transition-all ${editor.isActive('heading', { level: 1 }) ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>H1</button>
                    <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-white transition-all ${editor.isActive('heading', { level: 2 }) ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>H2</button>
                    <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={`px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-white transition-all ${editor.isActive('heading', { level: 3 }) ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>H3</button>
                    <div className="w-px bg-slate-200 mx-1 self-stretch" />
                    <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-2 rounded-xl text-sm hover:bg-white transition-all ${editor.isActive('bulletList') ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><List size={15} /></button>
                    <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`p-2 rounded-xl text-sm hover:bg-white transition-all ${editor.isActive('orderedList') ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><ListOrdered size={15} /></button>
                    <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={`p-2 rounded-xl text-sm hover:bg-white transition-all ${editor.isActive('taskList') ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><CheckSquare size={15} /></button>
                    <div className="w-px bg-slate-200 mx-1 self-stretch" />
                    <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={`p-2 rounded-xl text-sm hover:bg-white transition-all ${editor.isActive('codeBlock') ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Code size={15} /></button>
                    <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`p-2 rounded-xl text-sm hover:bg-white transition-all ${editor.isActive('blockquote') ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Quote size={15} /></button>

                    <div className="w-px bg-slate-200 mx-1 self-stretch" />

                    {/* Google Form Selector */}
                    <div className="flex items-center gap-2 ml-auto">
                        <select
                            value={googleFormId || ''}
                            onChange={(e) => onSave(editor.getHTML(), e.target.value || null)}
                            className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/10 min-w-[150px] transition-all"
                            disabled={isLoadingForms}
                        >
                            <option value="">연결된 구글 폼 없음</option>
                            {googleForms.map(form => (
                                <option key={form.id} value={form.id}>{form.name}</option>
                            ))}
                        </select>
                        {GAS_URL === 'YOUR_GAS_WEB_APP_URL' && (
                            <span className="text-[10px] text-slate-400 italic">GAS URL 설정 필요</span>
                        )}
                    </div>
                </div>
            )}

            <div className={`prose prose-slate dark:prose-invert max-w-none min-h-[300px] p-8 rounded-2xl bg-white dark:bg-[hsl(var(--secondary))] border border-slate-200 dark:border-[hsl(var(--border))] transition-all ${editable ? 'cursor-text focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10' : 'cursor-default'}`}>
                <EditorContent editor={editor} />
            </div>
        </div>
    );
};

export default ManualEditor;
