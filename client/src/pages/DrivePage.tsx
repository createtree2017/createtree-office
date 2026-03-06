import React, { useState, useEffect } from 'react';
import { FileText, Image as ImageIcon, File, Calendar, ExternalLink, Loader2, FolderOpen, Folder, ArrowLeft, X, Download } from 'lucide-react';
import toast from 'react-hot-toast';

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    createdTime: string;
    webViewLink: string;
    iconLink: string;
}

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

const DrivePage = () => {
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // 모달 뷰어 상태
    const [viewerFile, setViewerFile] = useState<DriveFile | null>(null);

    // 폴더 탐색 기록 (스택 구조)
    const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([
        { id: '1SI_8POn6S3YqdEcrYIbFSzaU_r2fw5KI', name: '공유 자료실' }
    ]);

    const currentFolder = folderStack[folderStack.length - 1];
    const canGoBack = folderStack.length > 1;

    useEffect(() => {
        const fetchFiles = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`/api/drive/folders/${currentFolder.id}`);
                const data = await response.json();

                if (data.success) {
                    // 폴더를 먼저 보여주고 그 다음 파일들을 보여주도록 정렬
                    const sortedFiles = data.files.sort((a: DriveFile, b: DriveFile) => {
                        const isAFolder = a.mimeType === FOLDER_MIME_TYPE;
                        const isBFolder = b.mimeType === FOLDER_MIME_TYPE;
                        if (isAFolder && !isBFolder) return -1;
                        if (!isAFolder && isBFolder) return 1;
                        return 0; // 둘 다 폴더거나 둘 다 파일이면 구글 API의 원래 정렬(최신순 등)을 따름
                    });
                    setFiles(sortedFiles);
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
    }, [currentFolder.id]);

    const handleGoBack = () => {
        if (canGoBack) {
            setFolderStack(prev => prev.slice(0, -1));
        }
    };

    const handleFolderClick = (file: DriveFile, e: React.MouseEvent) => {
        e.preventDefault();
        setFolderStack(prev => [...prev, { id: file.id, name: file.name }]);
    };

    const handleFileClick = (file: DriveFile, e: React.MouseEvent) => {
        e.preventDefault();

        setViewerFile(file);
    };

    const getFileIcon = (mimeType: string) => {
        if (mimeType === FOLDER_MIME_TYPE) return <Folder className="text-blue-500 fill-blue-500/20" />;
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
        <div className="min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] transition-colors duration-200">
            <div className="pt-20 px-6 max-w-6xl mx-auto pb-12 animate-in fade-in duration-700">
                <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex flex-col gap-3">
                        {canGoBack && (
                            <button
                                onClick={handleGoBack}
                                className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-blue-600 transition-colors self-start bg-slate-100/50 hover:bg-blue-50 dark:bg-slate-800/50 dark:hover:bg-blue-900/40 px-3 py-1.5 rounded-lg"
                            >
                                <ArrowLeft size={16} />
                                이전 폴더로
                            </button>
                        )}
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
                                <FolderOpen size={24} />
                            </div>
                            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                                {currentFolder.name}
                            </h1>
                        </div>
                        {!canGoBack && (
                            <p className="text-sm text-slate-500 dark:text-slate-400 pl-[52px]">
                                클라이언트 및 팀원들과 공유되는 주요 문서들을 확인합니다.
                            </p>
                        )}
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
                        <p className="text-sm text-slate-500 dark:text-slate-400">이 폴더는 비어있습니다.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {files.map((file) => {
                            const isFolder = file.mimeType === FOLDER_MIME_TYPE;

                            return (
                                <a
                                    key={file.id}
                                    href={isFolder ? '#' : file.webViewLink} // 폴더면 href 무력화
                                    target={isFolder ? '_self' : '_blank'}
                                    rel="noopener noreferrer"
                                    onClick={isFolder ? (e) => handleFolderClick(file, e) : (e) => handleFileClick(file, e)}
                                    className="group flex flex-col bg-white dark:bg-[hsl(var(--card))] border border-slate-200 dark:border-[hsl(var(--border))] rounded-2xl p-5 shadow-sm hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-500/50 transition-all cursor-pointer"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className={`p-3 rounded-xl transition-colors ${isFolder ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-slate-50 dark:bg-slate-800 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20'}`}>
                                            {getFileIcon(file.mimeType)}
                                        </div>
                                        {!isFolder && (
                                            <div className="p-2 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                                                <ExternalLink size={16} />
                                            </div>
                                        )}
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
                            );
                        })}
                    </div>
                )}

                {/* 문서 뷰어 모달 */}
                {viewerFile && (() => {
                    let viewerUrl = viewerFile.webViewLink;
                    if (viewerUrl.includes('?')) {
                        viewerUrl += '&rm=minimal&chrome=false';
                    } else {
                        viewerUrl += '?rm=minimal&chrome=false';
                    }
                    const downloadUrl = `https://drive.google.com/uc?export=download&id=${viewerFile.id}`;

                    return (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 md:p-8 lg:p-10 animate-fade-in">
                            <div className="w-full h-full bg-slate-100 dark:bg-slate-900 rounded-xl shadow-2xl flex flex-col overflow-hidden relative border border-slate-200 dark:border-slate-800">
                                {/* 상단 헤더 영역 (제목 및 닫기 버튼) */}
                                <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 shrink-0">
                                            <FileText size={20} />
                                        </div>
                                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">
                                            {viewerFile.name || '문서 뷰어'}
                                        </h2>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0 ml-4">
                                        <a
                                            href={downloadUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-600"
                                            title="파일 다운로드"
                                        >
                                            <Download size={16} />
                                            <span className="hidden sm:inline">다운로드</span>
                                        </a>
                                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1"></div>
                                        <button
                                            onClick={() => setViewerFile(null)}
                                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg transition-colors shadow-sm"
                                            title="모달 창 닫기"
                                        >
                                            <X size={18} />
                                            <span>닫기</span>
                                        </button>
                                    </div>
                                </div>

                                {/* 뷰어 iframe 영역 (헤더 아래 꽉 차게) */}
                                <div className="w-full h-full relative flex items-center justify-center flex-1 bg-white dark:bg-slate-950">
                                    {/* 로딩 표시 (iframe 로드 전까지) */}
                                    <div className="absolute inset-0 flex flex-col items-center justify-center z-0 text-slate-400 pointer-events-none">
                                        <Loader2 size={32} className="animate-spin text-blue-500 mb-2" />
                                        <p className="text-sm">문서를 불러오는 중입니다...</p>
                                    </div>
                                    <iframe
                                        src={viewerUrl}
                                        className="w-full h-full z-10 border-0 absolute inset-0"
                                        title="구글 문서 뷰어"
                                        allow="autoplay"
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};

export default DrivePage;
