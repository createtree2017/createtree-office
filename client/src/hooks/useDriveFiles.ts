import { useQuery } from '@tanstack/react-query';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    createdTime: string;
    webViewLink: string;
    iconLink: string;
}

export function useDriveFiles(folderId: string, searchQuery: string) {
    return useQuery<DriveFile[]>({
        queryKey: ['drive-files', folderId, searchQuery],
        queryFn: async () => {
            const query = searchQuery.trim();
            const url = query
                ? `/api/drive/search?q=${encodeURIComponent(query)}&folderId=${folderId}`
                : `/api/drive/folders/${folderId}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await response.json();

            if (response.status === 403) {
                const err = new Error(data.message || '접근 권한이 없습니다.');
                (err as any).status = 403;
                throw err;
            }

            if (!data.success) {
                throw new Error(data.message || '파일 목록을 불러오지 못했습니다.');
            }

            // 폴더를 먼저, 그 다음 파일
            return data.files.sort((a: DriveFile, b: DriveFile) => {
                const isAFolder = a.mimeType === FOLDER_MIME_TYPE;
                const isBFolder = b.mimeType === FOLDER_MIME_TYPE;
                if (isAFolder && !isBFolder) return -1;
                if (!isAFolder && isBFolder) return 1;
                return 0;
            });
        },
        staleTime: 60 * 1000,
    });
}
