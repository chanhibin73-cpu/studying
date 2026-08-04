'use client';

import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

// --- Firebase 初期化 ---
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
const db = getFirestore(app);

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
  createdById?: string;
  createdAt?: any;
}

interface User {
  uid: string;
  name: string;
  lastLoginDate?: any;
}

interface UserAnswer {
  id: string;
  userId: string;
  questionId: string;
  selectedChoice: number;
  isCorrect: boolean;
  answeredAt?: any;
}

interface QuestionToTutor {
  id: string;
  userId: string;
  message: string;
  reply?: string;
  status: 'unread' | 'replied';
  createdAt?: any;
}

interface StudentWeekRecord {
  user: User;
  totalSolved: number;
  days: {
    dateStr: string;
    fullDate: string;
    isLoggedIn: boolean;
    solvedCount: number;
  }[];
}

export default function TutorApp() {
  const [activeTab, setActiveTab] = useState<'create' | 'answers' | 'records'>('create');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [questionContent, setQuestionContent] = useState('');
  const [choices, setChoices] = useState<string[]>(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState<number>(0);
  const [explanation, setExplanation] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState('');

  const [users, setUsers] = useState<User[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [questionsToTutor, setQuestionsToTutor] = useState<QuestionToTutor[]>([]);
  const [replyTextMap, setReplyTextMap] = useState<{ [key: string]: string }>({});
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);

  const [expandedQuestionIds, setExpandedQuestionIds] = useState<{ [key: string]: boolean }>({});
  const [studentRecords, setStudentRecords] = useState<StudentWeekRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllData();
  }, [activeTab]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const fetchedUsers: User[] = usersSnap.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as Omit<User, 'uid'>),
      }));
      setUsers(fetchedUsers);

      const qSnap = await getDocs(collection(db, 'questions'));
      const fetchedQuestions: Question[] = qSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Question, 'id'>),
      }));
      setQuestions(fetchedQuestions);

      const answersSnap = await getDocs(collection(db, 'userAnswers'));
      const fetchedAnswers: UserAnswer[] = answersSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<UserAnswer, 'id'>),
      }));
      setUserAnswers(fetchedAnswers);

      const qToTutorSnap = await getDocs(collection(db, 'questionsToTutor'));
      const fetchedQToTutor: QuestionToTutor[] = qToTutorSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<QuestionToTutor, 'id'>),
      }));
      setQuestionsToTutor(fetchedQToTutor);

      calculateStudentRecords(fetchedUsers, fetchedAnswers);
    } catch (err) {
      console.error('データ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStudentRecords = (userList: User[], answerList: UserAnswer[]) => {
    const today = new Date();
    const daysTemplate: { dateStr: string; fullDate: string }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const fullDate = d.toISOString().split('T')[0];
      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
      const dateStr = `${d.getMonth() + 1}/${d.getDate()} (${dayOfWeek})`;
      daysTemplate.push({ dateStr, fullDate });
    }

    const records: StudentWeekRecord[] = userList.map((usr) => {
      const myAnswers = answerList.filter((a) => a.userId === usr.uid);
      const countMap: { [key: string]: number } = {};
      
      myAnswers.forEach((ans) => {
        if (ans.answeredAt) {
          const dateObj = (ans.answeredAt as Timestamp).toDate();
          const key = dateObj.toISOString().split('T')[0];
          countMap[key] = (countMap[key] || 0) + 1;
        }
      });

      let lastLoginKey = '';
      if (usr.lastLoginDate) {
        lastLoginKey = (usr.lastLoginDate as Timestamp).toDate().toISOString().split('T')[0];
      }

      const days = daysTemplate.map((dt) => {
        const solvedCount = countMap[dt.fullDate] || 0;
        const isLoggedIn = solvedCount > 0 || lastLoginKey === dt.fullDate;
        return {
          ...dt,
          solvedCount,
          isLoggedIn,
        };
      });

      return {
        user: usr,
        totalSolved: myAnswers.length,
        days,
      };
    });

    setStudentRecords(records);
  };

  const handlePublishQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionContent.trim() || choices.some((c) => !c.trim())) {
      alert('問題文と4つの選択肢をすべて入力してください。');
      return;
    }

    setIsPublishing(true);
    try {
      await addDoc(collection(db, 'questions'), {
        content: questionContent.trim(),
        choices: choices.map((c) => c.trim()),
        correctAnswer,
        explanation: explanation.trim() || '',
        createdById: 'tutor',
        createdAt: serverTimestamp(),
      });

      setQuestionContent('');
      setChoices(['', '', '', '']);
      setCorrectAnswer(0);
      setExplanation('');
      setPublishMessage('問題を作成・配信しました！');
      setTimeout(() => setPublishMessage(''), 3000);
      loadAllData();
    } catch (err) {
      console.error('問題作成エラー:', err);
      alert('問題作成に失敗しました。');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleChoiceChange = (index: number, text: string) => {
    const newChoices = [...choices];
    newChoices[index] = text;
    setChoices(newChoices);
  };

  const handleSendReply = async (qId: string) => {
    const text = replyTextMap[qId];
    if (!text || !text.trim()) return;

    setSendingReplyId(qId);
    try {
      await updateDoc(doc(db, 'questionsToTutor', qId), {
        reply: text.trim(),
        status: 'replied',
      });

      setQuestionsToTutor((prev) =>
        prev.map((item) =>
          item.id === qId ? { ...item, reply: text.trim(), status: 'replied' } : item
        )
      );

      setReplyTextMap((prev) => ({ ...prev, [qId]: '' }));
    } catch (err) {
      console.error('返信送信エラー:', err);
      alert('返信の送信に失敗しました。');
    } finally {
      setSendingReplyId(null);
    }
  };

  const toggleQuestionDetail = (qId: string) => {
    setExpandedQuestionIds((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-xl">👨‍🏫</span>
          <h1 className="font-bold text-lg">チューター管理画面</h1>
        </div>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 text-slate-300 hover:text-white rounded-lg focus:outline-none"
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
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsMenuOpen(false)} />
          <div className="relative bg-slate-800 text-white w-64 max-w-sm h-full shadow-2xl ml-auto flex flex-col p-6 z-50">
            <div className="flex justify-between items-center mb-6">
              <span className="font-bold text-slate-300 text-sm">メニュー選択</span>
              <button onClick={() => setIsMenuOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <nav className="space-y-3">
              <button onClick={() => { setActiveTab('create'); setIsMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 font-medium rounded-xl transition ${activeTab === 'create' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <span>📝</span><span>問題作成</span>
              </button>
              <button onClick={() => { setActiveTab('answers'); setIsMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 font-medium rounded-xl transition ${activeTab === 'answers' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <span>📊</span><span>生徒の回答・質問</span>
              </button>
              <button onClick={() => { setActiveTab('records'); setIsMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 font-medium rounded-xl transition ${activeTab === 'records' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <span>📅</span><span>生徒のログイン状況</span>
              </button>
            </nav>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400 font-medium">データを取得中...</div>
        ) : (
          <>
            {activeTab === 'create' && (
              <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">新しい四択問題を作成</h2>
                  <p className="text-xs text-slate-500 mt-1">作成した問題は即時に生徒側のアプリに配信されます。</p>
                </div>
                <form onSubmit={handlePublishQuestion} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">問題文 <span className="text-rose-500">*</span></label>
                    <textarea rows={3} value={questionContent} onChange={(e) => setQuestionContent(e.target.value)} placeholder="例: 日本で一番高い山はどれでしょう？" className="w-full p-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" required />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">四択の回答 ＆ 正解ラジオボタン選択 <span className="text-rose-500">*</span></label>
                    <div className="space-y-2">
                      {choices.map((choice, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input type="radio" name="correctAnswer" checked={correctAnswer === idx} onChange={() => setCorrectAnswer(idx)} className="w-5 h-5 text-indigo-600 focus:ring-indigo-500 cursor-pointer" id={`choice-${idx}`} />
                          <label htmlFor={`choice-${idx}`} className="text-xs font-bold text-slate-500 w-6">{idx + 1}.</label>
                          <input type="text" value={choice} onChange={(e) => handleChoiceChange(idx, e.target.value)} placeholder={`選択肢 ${idx + 1}`} className="flex-1 p-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" required />
                          {correctAnswer === idx && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">正解</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">解説 <span className="text-xs font-normal text-slate-400">（任意）</span></label>
                    <textarea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="正解の補足や解説を入力できます。" className="w-full p-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none" />
                  </div>
                  <button type="submit" disabled={isPublishing} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition shadow text-sm disabled:opacity-50">
                    {isPublishing ? '配信中...' : '問題を生徒に配信する'}
                  </button>
                  {publishMessage && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl text-center">{publishMessage}</div>}
                </form>
              </section>
            )}

            {activeTab === 'answers' && (
              <div className="space-y-6">
                <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center justify-between">
                    <span>💬 生徒からの質問</span>
                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full font-bold">{questionsToTutor.length} 件</span>
                  </h2>
                  {questionsToTutor.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">現在届いている質問はありません。</p>
                  ) : (
                    <div className="space-y-4">
                      {questionsToTutor.map((q) => {
                        const student = users.find((u) => u.uid === q.userId);
                        return (
                          <div key={q.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-slate-700">{student ? student.name : '不明な生徒'} さんからの質問</span>
                              <span className={`font-bold px-2 py-0.5 rounded ${q.status === 'replied' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {q.status === 'replied' ? '返信済み' : '未返信'}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-slate-800 bg-white p-3 rounded-lg border border-slate-100">{q.message}</p>
                            {q.reply && (
                              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg text-xs text-indigo-900 space-y-1">
                                <span className="font-bold text-indigo-700">あなたの返信:</span>
                                <p>{q.reply}</p>
                              </div>
                            )}
                            <div className="flex gap-2 pt-1">
                              <input type="text" value={replyTextMap[q.id] || ''} onChange={(e) => setReplyTextMap({ ...replyTextMap, [q.id]: e.target.value })} placeholder="返信メッセージを入力..." className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                              <button onClick={() => handleSendReply(q.id)} disabled={sendingReplyId === q.id} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-1.5 rounded-lg transition">返信</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <h2 className="text-lg font-bold text-slate-800">📊 問題ごとの回答状況（チューター＆生徒作成問題）</h2>
                  {questions.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">まだ作成された問題がありません。</p>
                  ) : (
                    <div className="space-y-4">
                      {questions.map((q) => {
                        const answersForQ = userAnswers.filter((a) => a.questionId === q.id);
                        const correctCount = answersForQ.filter((a) => a.isCorrect).length;
                        const isExpanded = !!expandedQuestionIds[q.id];
                        const creatorUser = users.find((u) => u.uid === q.createdById);
                        const creatorName = q.createdById === 'tutor' || !q.createdById ? 'チューター' : (creatorUser ? creatorUser.name : '生徒');

                        return (
                          <div key={q.id} className="p-4 border border-slate-200 rounded-xl space-y-3 bg-white">
                            <div className="flex justify-between items-start gap-2">
                              <div className="font-bold text-sm text-slate-800">{q.content}</div>
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                                作成者: {creatorName}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {q.choices.map((c, cIdx) => (
                                <div key={cIdx} className={`p-2 rounded-lg border ${cIdx === q.correctAnswer ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-800' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                                  {cIdx + 1}. {c} {cIdx === q.correctAnswer && '(正解)'}
                                </div>
                              ))}
                            </div>

                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                              <span>回答数: <strong className="text-slate-800">{answersForQ.length}</strong> 人</span>
                              <span>正答率: <strong className="text-emerald-600">{answersForQ.length > 0 ? Math.round((correctCount / answersForQ.length) * 100) : 0}%</strong></span>
                            </div>

                            {/* 生徒ごとの回答一覧トグルボタン */}
                            <div className="pt-2">
                              <button
                                onClick={() => toggleQuestionDetail(q.id)}
                                className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition flex items-center justify-between"
                              >
                                <span>👤 生徒ごとの回答一覧 ({answersForQ.length}件)</span>
                                <span>{isExpanded ? '▲ 閉じる' : '▼ 表示する'}</span>
                              </button>

                              {/* アコーディオン部分（生徒ごとの回答詳細） */}
                              {isExpanded && (
                                <div className="mt-3 space-y-2 pt-2 border-t border-slate-100">
                                  {answersForQ.length === 0 ? (
                                    <p className="text-[11px] text-slate-400 text-center py-2">この問題に回答した生徒はまだいません。</p>
                                  ) : (
                                    answersForQ.map((ans) => {
                                      const student = users.find((u) => u.uid === ans.userId);
                                      const selectedChoiceText = q.choices[ans.selectedChoice] || '不明';
                                      const timeStr = ans.answeredAt
                                        ? (ans.answeredAt as Timestamp).toDate().toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                        : '';

                                      return (
                                        <div
                                          key={ans.id}
                                          className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                                            ans.isCorrect
                                              ? 'bg-emerald-50/50 border-emerald-200'
                                              : 'bg-rose-50/50 border-rose-200'
                                          }`}
                                        >
                                          <div className="space-y-0.5">
                                            <div className="font-bold text-slate-800">
                                              {student ? student.name : '不明な生徒'}
                                              <span className="ml-2 font-normal text-[10px] text-slate-400">{timeStr}</span>
                                            </div>
                                            <div className="text-[11px] text-slate-600">
                                              選択: <span className="font-semibold">{ans.selectedChoice + 1}. {selectedChoiceText}</span>
                                            </div>
                                          </div>

                                          <div className="text-right">
                                            <span
                                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                                ans.isCorrect
                                                  ? 'bg-emerald-100 text-emerald-800'
                                                  : 'bg-rose-100 text-rose-800'
                                              }`}
                                            >
                                              {ans.isCorrect ? '正解 ◯' : '不正解 ✕'}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'records' && (
              <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">📅 生徒の1週間ログイン・解いた問題数</h2>
                  <p className="text-xs text-slate-500 mt-1">生徒側の「記録」画面と同じデータがリアルタイムで共有されています。</p>
                </div>
                {studentRecords.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">登録されている生徒はいません。</p>
                ) : (
                  <div className="space-y-6">
                    {studentRecords.map((rec) => (
                      <div key={rec.user.uid} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
                        <div className="flex justify-between items-center">
                          <h3 className="font-bold text-sm text-slate-800">{rec.user.name} さん</h3>
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">累計 {rec.totalSolved} 問クリア</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1 pt-1">
                          {rec.days.map((day, dIdx) => (
                            <div key={dIdx} className={`p-2 rounded-lg text-center border text-xs space-y-1 ${day.isLoggedIn ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'bg-white border-slate-200 text-slate-400'}`}>
                              <div className="text-[10px] font-medium text-slate-400">{day.dateStr.split(' ')[0]}</div>
                              <div className="font-bold">{day.isLoggedIn ? '✓' : '-'}</div>
                              <div className="text-[9px] font-semibold text-slate-600">{day.solvedCount > 0 ? `${day.solvedCount}問` : ''}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

