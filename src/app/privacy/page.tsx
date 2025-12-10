
export default function PrivacyPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-12">
            <h1 className="text-3xl font-bold mb-8">개인정보 처리방침</h1>
            <div className="prose dark:prose-invert max-w-none">
                <p>본 방침은 <strong>Golden Keyword Miner</strong>(이하 '서비스')가 이용자의 개인정보를 어떻게 수집, 사용, 보호하는지 설명합니다.</p>

                <h3>1. 수집하는 개인정보 항목</h3>
                <p>서비스는 회원가입이나 사용 과정에서 최소한의 정보만을 수집합니다 (현재 비로그인 서비스로 운영 중).</p>
                <ul>
                    <li>접속 로그, 쿠키, IP 주소 등의 자동 수집 정보</li>
                </ul>

                <h3>2. 개인정보의 수집 및 이용 목적</h3>
                <p>수집한 정보는 다음의 목적을 위해 활용됩니다.</p>
                <ul>
                    <li>서비스 제공 및 운영</li>
                    <li>트래픽 분석 및 서비스 품질 개선</li>
                </ul>

                <h3>3. 개인정보의 보유 및 이용 기간</h3>
                <p>원칙적으로, 개인정보 수집 및 이용목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.</p>
            </div>
        </div>
    );
}
