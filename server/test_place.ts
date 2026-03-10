import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const placeId = '13228';

console.log('\n=== 수정된 GraphQL 테스트 (total 필드명 수정) ===');
try {
    const r = await axios.post(
        "https://pcmap-api.place.naver.com/graphql",
        JSON.stringify([{
            operationName: "getVisitorReviews",
            variables: {
                input: {
                    businessId: placeId,
                    businessType: "place",
                    item: "0",
                    page: 1,
                    size: 5,
                    isPhotoUsed: false,
                    includeContent: true,
                    getUserStats: true,
                    includeReceiptPhotos: true,
                    cidList: [],
                }
            },
            query: `query getVisitorReviews($input: VisitorReviewsInput) { 
                visitorReviews(input: $input) { 
                    items { 
                        id 
                        rating 
                        author { nickname } 
                        body 
                        created 
                    } 
                    total
                } 
            }`
        }]),
        {
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                "Referer": `https://m.place.naver.com/place/${placeId}/review/visitor`,
                "Origin": "https://m.place.naver.com",
            },
            timeout: 10000,
        }
    );

    const data = Array.isArray(r.data) ? r.data[0] : r.data;
    const reviews = data?.data?.visitorReviews?.items || [];
    const total = data?.data?.visitorReviews?.total || 0;

    console.log(`상태: ${r.status}`);
    console.log(`총 리뷰 수: ${total}`);
    console.log(`수집된 리뷰: ${reviews.length}개`);

    if (reviews.length > 0) {
        console.log('\n첫 번째 리뷰:');
        console.log(`  내용: ${reviews[0].body?.substring(0, 100)}`);
        console.log(`  작성자: ${reviews[0].author?.nickname}`);
        console.log(`  별점: ${reviews[0].rating}`);
        console.log(`  날짜: ${reviews[0].created}`);
    }
} catch (e: any) {
    console.log(`상태: ${e?.response?.status || 'ERROR'}`);
    console.log(`에러: ${JSON.stringify(e?.response?.data || e?.message).substring(0, 400)}`);
}
