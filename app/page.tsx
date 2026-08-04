'use client';

import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

// --- Firebase 初期化（新しい設定に切り替え） ---
const firebaseConfig = {
  apiKey: "AIzaSyCLUmB0EZQo74lcag_wkO3W2eeSmgLbkLM",
  authDomain: "project-1224701875846372493.firebaseapp.com",
  databaseURL: "https://project-1224701875846372493-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "project-1224701875846372493",
  storageBucket: "project-1224701875846372493.firebasestorage.app",
  messagingSenderId: "1035606846917",
  appId: "1:1035606846917:web:137407f1ee94522cf46fac",
  measurementId: "G-T26H0PEDJ1"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Analytics の安全な初期化
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) getAnalytics(app);
  });
}

// --- 型定義 ---
interface Question {
  id: string;
  content: string;
  choices: string[];
  correctAnswer: number;
  explanation?: string;
}

interface DayRecord {
  dateStr: string;
  fullDate: string;
  isLoggedIn: boolean;
  solvedCount: number;
}

const COLOR_OPTIONS = [
  { name: 'ブルー', value: '#3B82F6', bgClass: 'bg-blue-500' },
  { name: 'エメラルド', value: '#10B981', bgClass: 'bg-emerald-500' },
  { name: 'パープル', value: '#8B5CF6', bgClass: 'bg-purple-500' },
  { name: 'ローズ', value: '#F43F5E', bgClass: 'bg-rose-500' },
];

export default function StudentApp() {
  const [activeTab, setActiveTab] = useState<
    'home' | 'questions' | 'review' | 'records' | 'settings'
  >('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState('');
  const [inputName, setInputName] = useState('');
  const [themeColor, setThemeColor] = useState('#3B82F6');
  const [needsNameRegistration, setNeedsNameRegistration] = useState(false);
  const [loading, setLoading] = useState(true);

  const [unansweredCount, setUnansweredCount] = useState(0);
  const [showPopup, setShowPopup] = useState(false);

  const [unansweredQuestions, setUnansweredQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [isQAnswered, setIsQAnswered] = useState(false);

  const [reviewTab, setReviewTab] = useState<'review' | 'ask'>('review');
  const [wrongQuestions, setWrongQuestions] = useState<Question[]>([]);
  const [reviewAnswers, setReviewAnswers] = useState<{ [key: string]: number }>({});
  const [reviewResults, setReviewResults] = useState<{ [key: string]: boolean }>({});
  const [askMessage, setAskMessage] = useState('');
  const [isAskSent, setIsAskSent] = useState(false);

  const [weekRecords, setWeekRecords] = useState<DayRecord[]>([]);
  const [totalSolvedCount, setTotalSolvedCount] = useState(0);
  const [settingsStatus, setSettingsStatus] = useState('');

  // 匿名ログイン監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await checkUserProfileAndStatus(currentUser.uid);
      } else {
        try {
          const res = await signInAnonymously(auth);
          setUser(res.user);
          await checkUserProfileAndStatus(res.user.uid);
        } catch (error: any) {
          console.error('匿名ログインエラー:', error);
          alert(`【エラー詳細】: ${error.message}\nFirebaseの Authentication で「匿名」が有効になっているか、もう一度確認してください。`);
          setNeedsNameRegistration(true);
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // ユーザー確認
  const checkUserProfileAndStatus = async (uid: string) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);

      if (!userSnap.exists() || !userSnap.data().name) {
        setNeedsNameRegistration(true);
        setLoading(false);
        return;
      }

      const userData = userSnap.data();
      setUserName(userData.name);
      if (userData.themeColor) setThemeColor(userData.themeColor);

      await updateDoc(userDocRef, {
        lastLoginDate: serverTimestamp(),
      });

      await checkUnansweredQuestions(uid);
    } catch (error: any) {
      console.error('ステータス確認エラー:', error);
      // 通信エラーが起きても強制的にポップアップを出す
      setNeedsNameRegistration(true);
    } finally {
      setLoading(false);
    }
  };

  const checkUnansweredQuestions = async (uid: string) => {
    try {
      const qSnap = await getDocs(collection(db, 'questions'));
      const allQ = qSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Question, 'id'>),
      }));

      const ansQuery = query(
        collection(db, 'userAnswers'),
        where('userId', '==', uid)
      );
      const ansSnap = await getDocs(ansQuery);
      const answeredIds = new Set(ansSnap.docs.map((d) => d.data().questionId));

      const unansList = allQ.filter((q) => !answeredIds.has(q.id));
      setUnansweredQuestions(unansList);
      setUnansweredCount(unansList.length);

      if (unansList.length > 0) {
        setShowPopup(true);
      }
    } catch (error) {
      console.error('未解答問題取得エラー:', error);
    }
  };

  // 初回名前登録
  const handleRegisterName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;

    if (!user) {
      alert('ログイン処理が完了していません。画面を再読み込みしてください。');
      return;
    }

    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        name: inputName.trim(),
        themeColor: '#3B82F6',
        createdAt: serverTimestamp(),
        lastLoginDate: serverTimestamp(),
      });

      setUserName(inputName.trim());
      setNeedsNameRegistration(false);
      await checkUnansweredQuestions(user.uid);
    } catch (error: any) {
      console.error('名前登録エラー:', error);
      alert(`エラー詳細: ${error.message}\n\n【考えられる原因】\n1. Firestore Databaseを作成していない\n2. セキュリティルールを「公開」していない`);
    }
  };

  const handleSubmitAnswer = async () => {
    if (selectedChoice === null || !user) return;
    const currentQ = unansweredQuestions[currentQIndex];
    const isCorrect = selectedChoice === currentQ.correctAnswer;
    try {
      await addDoc(collection(db, 'userAnswers'), {
        userId: user.uid,
        questionId: currentQ.id,
        selectedChoice,
        isCorrect,
        answeredAt: serverTimestamp(),
      });
      setIsQAnswered(true);
    } catch (error) {
      console.error('解答送信エラー:', error);
    }
  };

  const handleNextQuestion = () => {
    if (currentQIndex + 1 < unansweredQuestions.length) {
      setCurrentQIndex((prev) => prev + 1);
      setSelectedChoice(null);
      setIsQAnswered(false);
    } else {
      setUnansweredQuestions([]);
      setUnansweredCount(0);
    }
  };

  const loadReviewData = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'userAnswers'),
        where('userId', '==', user.uid),
        where('isCorrect', '==', false)
      );
      const snap = await getDocs(q);
      const wrongIds = Array.from(
        new Set(snap.docs.map((d) => d.data().questionId as string))
      );

      const qPromises = wrongIds.map(async (id) => {
        const qDoc = await getDoc(doc(db, 'questions', id));
        if (qDoc.exists()) {
          return { id: qDoc.id, ...qDoc.data() } as Question;
        }
        return null;
      });

      const list = (await Promise.all(qPromises)).filter(
        (q): q is Question => q !== null
      );
      setWrongQuestions(list);
    } catch (error) {
      console.error('復習データ取得エラー:', error);
    }
  };

  const handleReviewSelect = (qId: string, cIdx: number, correctAnswer: number) => {
    setReviewAnswers((prev) => ({ ...prev, [qId]: cIdx }));
    setReviewResults((prev) => ({ ...prev, [qId]: cIdx === correctAnswer }));
  };

  const handleSendQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!askMessage.trim() || !user) return;
    try {
      await addDoc(collection(db, 'questionsToTutor'), {
        userId: user.uid,
        message: askMessage.trim(),
        createdAt: serverTimestamp(),
        status: 'unread',
      });
      setAskMessage('');
      setIsAskSent(true);
      setTimeout(() => setIsAskSent(false), 3000);
    } catch (error) {
      console.error('質問送信エラー:', error);
    }
  };

  const loadRecordsData = async () => {
    if (!user) return;
    try {
      const days: DayRecord[] = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const fullDate = d.toISOString().split('T')[0];
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
        const dateStr = `${d.getMonth() + 1}/${d.getDate()} (${dayOfWeek})`;
        days.push({ dateStr, fullDate, isLoggedIn: false, solvedCount: 0 });
      }

      const ansQuery = query(
        collection(db, 'userAnswers'),
        where('userId', '==', user.uid)
      );
      const ansSnap = await getDocs(ansQuery);

      let total = 0;
      const countMap: { [key: string]: number } = {};
      ansSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.answeredAt) {
          const dateObj = (data.answeredAt as Timestamp).toDate();
          const key = dateObj.toISOString().split('T')[0];
          countMap[key] = (countMap[key] || 0) + 1;
          total++;
        }
      });

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      let lastLoginKey = '';
      if (userDoc.exists() && userDoc.data().lastLoginDate) {
        lastLoginKey = (userDoc.data().lastLoginDate as Timestamp).toDate().toISOString().split('T')[0];
      }

      const updatedDays = days.map((day) => {
        const solved = countMap[day.fullDate] || 0;
        const loggedIn = solved > 0 || lastLoginKey === day.fullDate;
        return {
          ...day,
          solvedCount: solved,
          isLoggedIn: loggedIn,
        };
      });

      setWeekRecords(updatedDays);
      setTotalSolvedCount(total);
    } catch (error) {
      console.error('記録取得エラー:', error);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name: userName.trim(),
        themeColor,
      });
      setSettingsStatus('設定を更新しました！');
      setTimeout(() => setSettingsStatus(''), 3000);
    } catch (error) {
      console.error('設定保存エラー:', error);
    }
  };

  const handleNavigate = (tab: 'home' | 'questions' | 'review' | 'records' | 'settings') => {
    setActiveTab(tab);
    setIsMenuOpen(false);
    if (tab === 'review') loadReviewData();
    if (tab === 'records') loadRecordsData();
  };

  if (loading && !needsNameRegistration) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500 font-medium">データを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-10">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes modalPopIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .smooth-content {
          animation: slideFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .smooth-modal {
          animation: modalPopIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />

      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <button onClick={() => handleNavigate('home')} className="font-bold text-lg text-slate-800">
          復習クイズ生徒用
        </button>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 text-slate-600 rounded-lg hover:bg-slate-100 focus:outline-none"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </header>

      {isMenuOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setIsMenuOpen(false)} />
          <div className="relative bg-white w-64 max-w-sm h-full shadow-2xl ml-auto flex flex-col p-6 z-50">
            <div className="flex justify-between items-center mb-6">
              <span className="font-bold text-slate-700">メニュー</span>
              <button onClick={() => setIsMenuOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <nav className="space-y-2">
              <button onClick={() => handleNavigate('home')} className={`w-full flex items-center gap-3 px-4 py-3 font-medium rounded-xl transition ${activeTab === 'home' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span>🏠</span><span>ホーム</span>
              </button>
              <button onClick={() => handleNavigate('questions')} className={`w-full flex items-center gap-3 px-4 py-3 font-medium rounded-xl transition ${activeTab === 'questions' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span>✏️</span><span>チューターからの問題</span>
                {unansweredCount > 0 && <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{unansweredCount}</span>}
              </button>
              <button onClick={() => handleNavigate('review')} className={`w-full flex items-center gap-3 px-4 py-3 font-medium rounded-xl transition ${activeTab === 'review' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span>🔄</span><span>復習・質問</span>
              </button>
              <button onClick={() => handleNavigate('records')} className={`w-full flex items-center gap-3 px-4 py-3 font-medium rounded-xl transition ${activeTab === 'records' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span>📅</span><span>学習記録</span>
              </button>
              <button onClick={() => handleNavigate('settings')} className={`w-full flex items-center gap-3 px-4 py-3 font-medium rounded-xl transition ${activeTab === 'settings' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span>⚙️</span><span>設定</span>
              </button>
            </nav>
          </div>
        </div>
      )}

      {needsNameRegistration && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl smooth-modal">
            <h2 className="text-xl font-bold mb-2 text-center text-slate-800">ようこそ！</h2>
            <p className="text-xs text-slate-500 mb-4 text-center">
              学習を始める前に、あなたの名前を入力してください。
            </p>
            <form onSubmit={handleRegisterName} className="space-y-4">
              <input
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="例: たろう"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                required
              />
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl transition shadow text-sm"
              >
                登録してスタート
              </button>
            </form>
          </div>
        </div>
      )}

      {showPopup && activeTab === 'home' && !needsNameRegistration && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center space-y-4 smooth-modal">
            <div className="text-4xl">📝</div>
            <h3 className="text-lg font-bold text-slate-800">新しい問題があります！</h3>
            <p className="text-xs text-slate-600">
              まだ解いていない問題が <span className="font-bold text-blue-600">{unansweredCount}問</span> あります。挑戦してみましょう！
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowPopup(false)} className="flex-1 py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition">
                後で
              </button>
              <button onClick={() => { setShowPopup(false); handleNavigate('questions'); }} className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow transition">
                問題を解く
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-md mx-auto p-4 space-y-6 pt-6">
        {activeTab === 'home' && (
          <div className="space-y-6 smooth-content">
            <header className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <p className="text-xs text-slate-400">おかえりなさい！</p>
              <h1 className="text-2xl font-bold text-slate-800">{userName || 'ゲスト'} さん</h1>
            </header>
            <section className="grid grid-cols-2 gap-4">
              <button onClick={() => handleNavigate('questions')} className="p-5 bg-white hover:bg-blue-50/50 border border-slate-200 rounded-2xl text-left transition space-y-2 shadow-sm relative">
                <div className="text-3xl">✏️</div>
                <div className="font-bold text-slate-800 text-sm">チューターからの問題</div>
                {unansweredCount > 0 && <span className="inline-block bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">未解答 {unansweredCount}</span>}
              </button>
              <button onClick={() => handleNavigate('review')} className="p-5 bg-white hover:bg-amber-50/50 border border-slate-200 rounded-2xl text-left transition space-y-2 shadow-sm">
                <div className="text-3xl">🔄</div>
                <div className="font-bold text-slate-800 text-sm">復習・質問</div>
              </button>
              <button onClick={() => handleNavigate('records')} className="p-5 bg-white hover:bg-emerald-50/50 border border-slate-200 rounded-2xl text-left transition space-y-2 shadow-sm">
                <div className="text-3xl">📅</div>
                <div className="font-bold text-slate-800 text-sm">学習記録</div>
              </button>
              <button onClick={() => handleNavigate('settings')} className="p-5 bg-white hover:bg-purple-50/50 border border-slate-200 rounded-2xl text-left transition space-y-2 shadow-sm">
                <div className="text-3xl">⚙️</div>
                <div className="font-bold text-slate-800 text-sm">設定</div>
              </button>
            </section>
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="space-y-6 smooth-content">
            {unansweredQuestions.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm text-center space-y-4">
                <div className="text-5xl">🎉</div>
                <h2 className="text-lg font-bold text-slate-800">すべての問題が完了しました！</h2>
                <button onClick={() => handleNavigate('home')} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition shadow text-xs">ホームに戻る</button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                  <span>問題 {currentQIndex + 1} / {unansweredQuestions.length}</span>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[120px] flex items-center justify-center">
                  <p className="text-base font-bold text-slate-800 text-center">{unansweredQuestions[currentQIndex].content}</p>
                </div>
                <div className="space-y-2.5">
                  {unansweredQuestions[currentQIndex].choices.map((choice, idx) => {
                    let btnStyle = 'w-full p-4 border rounded-xl text-left text-sm font-medium transition text-slate-700 border-slate-200 hover:border-blue-300';
                    if (selectedChoice === idx) btnStyle = 'w-full p-4 border-2 rounded-xl text-left text-sm font-medium transition border-blue-600 bg-blue-50 text-blue-700';
                    if (isQAnswered) {
                      if (idx === unansweredQuestions[currentQIndex].correctAnswer) btnStyle = 'w-full p-4 border-2 rounded-xl text-left text-sm font-medium bg-emerald-100 border-emerald-500 text-emerald-800';
                      else if (selectedChoice === idx) btnStyle = 'w-full p-4 border-2 rounded-xl text-left text-sm font-medium bg-rose-100 border-rose-500 text-rose-800';
                    }
                    return (
                      <button key={idx} disabled={isQAnswered} onClick={() => setSelectedChoice(idx)} className={btnStyle}>
                        <span className="mr-3 font-bold text-slate-400">{idx + 1}.</span>{choice}
                      </button>
                    );
                  })}
                </div>
                {isQAnswered && unansweredQuestions[currentQIndex].explanation && (
                  <div className="p-4 bg-slate-100 rounded-xl text-xs text-slate-700 space-y-1">
                    <span className="font-bold text-slate-900">💡 解説:</span>
                    <p>{unansweredQuestions[currentQIndex].explanation}</p>
                  </div>
                )}
                <div className="pt-2">
                  {!isQAnswered ? (
                    <button onClick={handleSubmitAnswer} disabled={selectedChoice === null} className={`w-full py-3 rounded-xl font-bold transition shadow text-xs ${selectedChoice !== null ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>回答を送信する</button>
                  ) : (
                    <button onClick={handleNextQuestion} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition shadow text-xs">{currentQIndex + 1 < unansweredQuestions.length ? '次の問題へ' : '結果を見る'}</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'review' && (
          <div className="space-y-6 smooth-content">
            <div className="flex bg-slate-200 p-1 rounded-xl">
              <button onClick={() => setReviewTab('review')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${reviewTab === 'review' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}>間違えた問題 ({wrongQuestions.length})</button>
              <button onClick={() => setReviewTab('ask')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${reviewTab === 'ask' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}>チューターに質問</button>
            </div>
            {reviewTab === 'review' ? (
              <div className="space-y-4">
                {wrongQuestions.length === 0 ? (
                  <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="text-4xl mb-2">✨</div>
                    <p className="font-bold text-slate-700 text-sm">復習する問題はありません！</p>
                  </div>
                ) : (
                  wrongQuestions.map((q, idx) => (
                    <div key={q.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">復習 {idx + 1}</span>
                      <p className="font-bold text-slate-800 text-sm">{q.content}</p>
                      <div className="space-y-2 pt-1">
                        {q.choices.map((choice, cIdx) => {
                          const isSelected = reviewAnswers[q.id] === cIdx;
                          const isAnswered = reviewAnswers[q.id] !== undefined;
                          const isCorrect = reviewResults[q.id];
                          let style = 'w-full p-3 text-left border rounded-xl text-xs font-medium transition ';
                          if (isAnswered) {
                            if (cIdx === q.correctAnswer) style += 'bg-emerald-100 border-emerald-500 text-emerald-800';
                            else if (isSelected && !isCorrect) style += 'bg-rose-100 border-rose-500 text-rose-800';
                            else style += 'border-slate-200 text-slate-400';
                          } else {
                            style += 'border-slate-200 hover:border-blue-300 text-slate-700';
                          }
                          return (
                            <button key={cIdx} disabled={isAnswered} onClick={() => handleReviewSelect(q.id, cIdx, q.correctAnswer)} className={style}>
                              {cIdx + 1}. {choice}
                            </button>
                          );
                        })}
                      </div>
                      {reviewResults[q.id] !== undefined && (
                        <p className={`text-xs font-bold text-center mt-2 ${reviewResults[q.id] ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {reviewResults[q.id] ? '正解です！解き方をマスターできました！' : 'もう一度見直してみましょう。'}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                <h2 className="font-bold text-slate-800 text-sm">チューターへ質問メッセージを送る</h2>
                <form onSubmit={handleSendQuestion} className="space-y-4">
                  <textarea rows={4} value={askMessage} onChange={(e) => setAskMessage(e.target.value)} placeholder="質問を入力..." className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs resize-none" required />
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition shadow text-xs">送信する</button>
                </form>
                {isAskSent && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-bold text-center">送信しました！</div>}
              </div>
            )}
          </div>
        )}

        {activeTab === 'records' && (
          <div className="space-y-6 smooth-content">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-2xl text-white shadow-md">
              <p className="text-xs font-medium opacity-80">これまでの努力の成果</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-extrabold">{totalSolvedCount}</span>
                <span className="text-xs font-semibold">問 クリア！</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <h2 className="font-bold text-slate-800 text-sm flex items-center justify-between">
                <span>直近1週間の学習記録</span>
              </h2>
              <div className="space-y-2.5">
                {weekRecords.map((r, i) => (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-xl border transition ${r.isLoggedIn ? 'bg-blue-50/40 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${r.isLoggedIn ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                        {r.isLoggedIn ? '✓' : '-'}
                      </div>
                      <span className="text-xs font-semibold text-slate-700">{r.dateStr}</span>
                    </div>
                    <div>
                      {r.solvedCount > 0 ? <span className="inline-block bg-blue-100 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-lg">{r.solvedCount} 問解答</span> : <span className="text-[10px] text-slate-400">解答なし</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6 smooth-content">
            <h1 className="text-lg font-bold text-slate-800">設定</h1>
            <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">お名前</label>
                <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs" required />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">テーマカラー</label>
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setThemeColor(color.value)}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition ${
                        themeColor === color.value ? 'border-slate-800 ring-2 ring-slate-800' : 'border-slate-200'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full ${color.bgClass}`} />
                      <span className="text-[9px] font-medium text-slate-600">{color.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition shadow text-xs">設定を保存</button>
              {settingsStatus && <p className="text-xs font-bold text-center text-emerald-600">{settingsStatus}</p>}
            </form>

            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-3">
              <h2 className="font-bold text-slate-800 text-xs">更新情報</h2>
              <ul className="space-y-3 text-[11px] text-slate-600">
                <li className="border-b border-slate-100 pb-2">
                  <span className="text-slate-400 block mb-0.5">2026/08/01</span>
                  <p className="font-medium text-slate-700">学習記録カレンダー・復習機能を追加しました。</p>
                </li>
                <li>
                  <span className="text-slate-400 block mb-0.5">2026/07/01</span>
                  <p className="font-medium text-slate-700">アプリを公開しました！</p>
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}


