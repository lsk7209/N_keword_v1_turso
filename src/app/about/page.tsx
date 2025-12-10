
export default function AboutPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-12">
            <h1 className="text-3xl font-bold mb-6">서비스 소개</h1>
            <div className="prose dark:prose-invert">
                <p className="mb-4">
                    <strong>네이버 황금키워드 채굴기</strong>는 데이터 기반의 스마트한 키워드 분석 도구입니다.
                </p>
                <p className="mb-4">
                    수백만 건의 네이버 검색 데이터와 블로그/카페 문서 수를 실시간으로 분석하여,
                    경쟁은 낮고 검색량은 높은 <strong>'황금 키워드'</strong>를 찾아냅니다.
                </p>
                <h2 className="text-xl font-semibold mt-8 mb-4">핵심 기능</h2>
                <ul className="list-disc pl-6 space-y-2">
                    <li>실시간 검색량 및 문서 수 분석</li>
                    <li>황금 비율(Golden Ratio) 기반 블루오션 키워드 추천</li>
                    <li>트래픽 확보를 위한 High Volume 키워드 필터링</li>
                </ul>
            </div>
        </div>
    );
}
