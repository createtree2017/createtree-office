import React, { useState, useEffect } from 'react';
import { FileText, Image as ImageIcon, File, Calendar, Download, ExternalLink, Loader2, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    createdTime: string;
    webViewLink: string;
    iconLink: string;
}

const DrivePage = () => {
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // 관리자가 넘겨준 기본 대상 구글 폴더 ID
    const TARGET_FOLDER_ID = '1SI_8POn6S3YqdEcrYIbFSzaU_r2fw5KI';

    useEffect(() => {
        const fetchFiles = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`/api/drive/folders/${TARGET_FOLDER_ID}`);
                const data = await response.json();

                if (data.success) {
                    setFiles(data.files);
                } else {
                    toast.error(data.message || '파일 목록을 불러오지 못했습니다.');
                }
            } catch (error) {
                console.error('Error fetching drive files:', error);
                toast.error('서버와의 통신에 실패했습니다.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchFiles();
    }, []);

    const getFileIcon = (mimeType: string) => {
        if (mimeType.includes('pdf')) return <FileText className="text-red-500" />;
        if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileText className="text-green-500" />;
        if (mimeType.includes('document') || mimeType.includes('word')) return <FileText className="text-blue-500" />;
        if (mimeType.includes('image')) return <ImageIcon className="text-purple-500" />;
        return <File className="text-slate-500" />;
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    return (
        <div className="pt-20 px-6 max-w-6xl mx-auto pb-12">
            <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
                            <FolderOpen size={24} />
                        </div>
                        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">공유 자료실</h1>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 pl-[52px]">
                        클라이언트 및 팀원들과 공유되는 주요 문서들을 확인합니다.
                    </p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center p-20 gap-4 text-slate-400">
                    <Loader2 size={32} className="animate-spin text-blue-500" />
                    <p className="text-sm font-medium">구글 드라이브에서 파일 목록을 가져오는 중...</p>
                </div>
            ) : files.length === 0 ? (
                <div className="text-center p-20 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                    <FolderOpen size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">공유된 파일이 없습니다</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">구글 드라이브 폴더에 파일을 업로드해주세요.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {files.map((file) => (
                        <a
                            key={file.id}
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex flex-col bg-white dark:bg-[hsl(var(--card))] border border-slate-200 dark:border-[hsl(var(--border))] rounded-2xl p-5 shadow-sm hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-500/50 transition-all cursor-pointer"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
                                    {getFileIcon(file.mimeType)}
                                </div>
                                <div className="p-2 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                                    <ExternalLink size={16} />
                                </div>
                            </div>

                            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-[15px] mb-2 line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {file.name}
                            </h3>

                            <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800/50 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-md">
                                    <Calendar size={12} />
                                    {formatDate(file.createdTime)}
                                </span>
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DrivePage;
