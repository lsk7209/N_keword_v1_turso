
import { Mail, MapPin } from 'lucide-react';

export default function ContactPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-12">
            <h1 className="text-3xl font-bold mb-8">문의하기</h1>

            <div className="grid md:grid-cols-2 gap-12">
                <div className="space-y-6">
                    <p className="text-zinc-600 dark:text-zinc-300">
                        서비스 이용 중 궁금한 점이나 제안하고 싶은 내용이 있으시면 언제든지 연락주세요.
                        빠른 시일 내에 답변 드리겠습니다.
                    </p>

                    <div className="space-y-4">
                        <div className="flex items-start gap-4">
                            <Mail className="w-6 h-6 text-emerald-600 mt-1" />
                            <div>
                                <h3 className="font-semibold">이메일</h3>
                                <p className="text-zinc-500">support@goldenkey.com</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <MapPin className="w-6 h-6 text-emerald-600 mt-1" />
                            <div>
                                <h3 className="font-semibold">오피스</h3>
                                <p className="text-zinc-500">서울시 강남구 테헤란로 123</p>
                            </div>
                        </div>
                    </div>
                </div>

                <form className="space-y-4 p-6 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                    <div>
                        <label className="block text-sm font-medium mb-1">이름</label>
                        <input type="text" className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900" placeholder="홍길동" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">이메일</label>
                        <input type="email" className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900" placeholder="hello@example.com" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">메시지</label>
                        <textarea rows={4} className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900" placeholder="문의 내용을 입력해주세요."></textarea>
                    </div>
                    <button type="button" className="w-full py-2 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 transition-colors">
                        보내기
                    </button>
                </form>
            </div>
        </div>
    );
}
