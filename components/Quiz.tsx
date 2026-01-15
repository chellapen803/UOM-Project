import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, Loader2, CheckCircle2, X, ChevronLeft, ChevronRight, 
  AlertCircle, Play, RotateCcw, Award, Clock, BookOpen
} from 'lucide-react';
import { extractContentFromPdf, PdfPage } from '../services/pdfService';
import { extractQuestionsFromPdf, QuizQuestion } from '../services/quizService';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Badge, Alert, AlertTitle, AlertDescription } from './ui';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

type QuizState = 'upload' | 'extracting' | 'ready' | 'taking' | 'review';

const Quiz = () => {
  const { currentUser } = useAuth();
  const [state, setState] = useState<QuizState>('upload');
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [pdfPages, setPdfPages] = useState<PdfPage[]>([]);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfParseProgress, setPdfParseProgress] = useState({ current: 0, total: 0 });
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string>('');
  const [extractionProgress, setExtractionProgress] = useState<{
    batch: number;
    totalBatches: number;
    questionsExtracted: number;
    status: string;
  } | null>(null);
  
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]); // Selected questions for the quiz (90 random)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, 'A' | 'B' | 'C' | 'D' | null>>({});
  const [showResults, setShowResults] = useState(false);
  const [timeStarted, setTimeStarted] = useState<number | null>(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [questionsPerPage, setQuestionsPerPage] = useState(10);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start timer when quiz begins
  React.useEffect(() => {
    if (state === 'taking' && timeStarted) {
      timerIntervalRef.current = setInterval(() => {
        setTimeElapsed(Math.floor((Date.now() - timeStarted) / 1000));
      }, 1000);
    }
    
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [state, timeStarted]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFileName(file.name);
    setIsParsingPdf(true);
    setPdfPages([]);
    setExtractError('');
    setPdfParseProgress({ current: 0, total: 0 });

    try {
      const result = await extractContentFromPdf(file, (current, total) => {
        setPdfParseProgress({ current, total });
      });
      
      setPdfPages(result.pages);
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Failed to parse PDF.");
      setPdfFileName('');
    } finally {
      setIsParsingPdf(false);
      setPdfParseProgress({ current: 0, total: 0 });
    }
  };

  const handleExtractQuestions = async () => {
    if (pdfPages.length === 0) return;
    
    setIsExtracting(true);
    setExtractError('');
    setExtractionProgress(null);
    
    try {
      // Get Firebase auth token
      if (!currentUser) {
        throw new Error('You must be logged in to extract questions');
      }
      
      const token = await currentUser.getIdToken();
      
      const result = await extractQuestionsFromPdf(pdfPages, token, (progress) => {
        if (progress.type === 'progress') {
          setExtractionProgress({
            batch: progress.batch || 0,
            totalBatches: progress.totalBatches || 1,
            questionsExtracted: progress.questionsExtracted || 0,
            status: progress.status || 'Processing...'
          });
        }
      });
      
      if (result.questions && result.questions.length > 0) {
        setQuestions(result.questions);
        setState('ready');
        setExtractionProgress(null);
      } else {
        setExtractError('No questions found in the PDF. Please ensure the PDF contains questions and answers.');
      }
    } catch (error: any) {
      console.error('Error extracting questions:', error);
      
      // Handle service unavailable/overloaded errors (503)
      if (error.type === 'service_unavailable' || error.message?.includes('overloaded') || error.message?.includes('UNAVAILABLE')) {
        const errorMsg = error.message || 'Gemini API is currently overloaded. Please try again in a few moments.';
        setExtractError(errorMsg);
      } 
      // Handle quota errors with better formatting
      else if (error.type === 'quota_exceeded' || error.message?.includes('quota')) {
        const errorMsg = error.message || 'API quota exceeded';
        setExtractError(errorMsg);
      } else {
        setExtractError(error.message || 'Failed to extract questions from PDF. Please try again.');
      }
    } finally {
      setIsExtracting(false);
      setExtractionProgress(null);
    }
  };

  const startQuiz = () => {
    // Randomly select 90 questions (or all if less than 90)
    const QUIZ_QUESTION_COUNT = 90;
    let selectedQuestions: QuizQuestion[] = [];
    
    if (questions.length <= QUIZ_QUESTION_COUNT) {
      // If we have 90 or fewer questions, use all of them
      selectedQuestions = [...questions];
    } else {
      // Randomly select 90 questions
      const shuffled = [...questions].sort(() => Math.random() - 0.5);
      selectedQuestions = shuffled.slice(0, QUIZ_QUESTION_COUNT);
      // Re-number the questions to be sequential (1, 2, 3, ...)
      selectedQuestions = selectedQuestions.map((q, idx) => ({
        ...q,
        id: idx + 1
      }));
    }
    
    setQuizQuestions(selectedQuestions);
    setState('taking');
    setCurrentQuestionIndex(0);
    setAnswers({});
    setShowResults(false);
    setTimeStarted(Date.now());
    setTimeElapsed(0);
  };

  const handleAnswerSelect = (answer: 'A' | 'B' | 'C' | 'D') => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: answer
    }));
  };

  const goToQuestion = (index: number) => {
    const maxIndex = activeQuestions.length - 1;
    if (index >= 0 && index <= maxIndex) {
      setCurrentQuestionIndex(index);
    }
  };

  const finishQuiz = () => {
    setShowResults(true);
    setState('review');
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
  };

  const resetQuiz = () => {
    setState('upload');
    setPdfFileName('');
    setPdfPages([]);
    setQuestions([]);
    setQuizQuestions([]);
    setCurrentQuestionIndex(0);
    setAnswers({});
    setShowResults(false);
    setTimeStarted(null);
    setTimeElapsed(0);
    setExtractError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Use quizQuestions when taking quiz, otherwise use all questions
  const activeQuestions = state === 'taking' || state === 'review' ? quizQuestions : questions;
  
  const currentQuestion = activeQuestions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;
  const correctCount = activeQuestions.filter((q, idx) => answers[idx] === q.correctAnswer).length;
  const score = activeQuestions.length > 0 ? Math.round((correctCount / activeQuestions.length) * 100) : 0;
  
  // Pagination calculations
  const totalPages = Math.ceil(activeQuestions.length / questionsPerPage);
  const currentPage = Math.floor(currentQuestionIndex / questionsPerPage) + 1;
  const startQuestionIndex = (currentPage - 1) * questionsPerPage;
  const endQuestionIndex = Math.min(startQuestionIndex + questionsPerPage, activeQuestions.length);
  const questionsOnCurrentPage = activeQuestions.slice(startQuestionIndex, endQuestionIndex);
  
  // Navigation helpers
  const goToPage = (page: number) => {
    const targetPage = Math.max(1, Math.min(page, totalPages));
    const targetIndex = (targetPage - 1) * questionsPerPage;
    goToQuestion(targetIndex);
  };
  
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  };
  
  const goToPrevPage = () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="text-blue-600" size={28} />
            Quiz Simulator
          </h2>
          <p className="text-slate-500 mt-1">Upload a PDF with questions and take an exam-style quiz</p>
        </div>

        {/* UPLOAD STATE */}
        {state === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upload Quiz PDF</CardTitle>
              <CardDescription>Upload a PDF containing questions and answers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-10 flex flex-col items-center justify-center text-center hover:bg-slate-50/50 transition-colors">
                  {pdfFileName ? (
                    <div className="w-full max-w-sm">
                      <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileText className="text-blue-600" size={20} />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-medium text-blue-900 truncate">{pdfFileName}</p>
                          <p className="text-xs text-blue-700">
                            {isParsingPdf && pdfParseProgress.total > 0 
                              ? `Processing page ${pdfParseProgress.current} of ${pdfParseProgress.total}...`
                              : pdfPages.length > 0 
                                ? `${pdfPages.length} pages ready` 
                                : 'Processing...'}
                          </p>
                          {isParsingPdf && pdfParseProgress.total > 0 && (
                            <div className="mt-1 w-full bg-blue-200 rounded-full h-1">
                              <div 
                                className="bg-blue-600 h-1 rounded-full transition-all duration-300" 
                                style={{ width: `${(pdfParseProgress.current / pdfParseProgress.total) * 100}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => {
                            setPdfFileName('');
                            setPdfPages([]);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }} 
                          className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                        >
                          <X size={16} />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-500">
                        <Upload size={24} />
                      </div>
                      <h3 className="font-semibold text-slate-900">Click to upload PDF</h3>
                      <Input 
                        ref={fileInputRef}
                        type="file" 
                        accept=".pdf"
                        onChange={handleFileChange}
                        className="max-w-xs cursor-pointer mt-4"
                      />
                    </>
                  )}
                </div>

                {extractError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>
                      {extractError.includes('quota') ? 'API Quota Exceeded' : 'Extraction Error'}
                    </AlertTitle>
                    <AlertDescription className="whitespace-pre-line">
                      {extractError}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              {isExtracting && extractionProgress && (
                <div className="w-full space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{extractionProgress.status}</span>
                    <span className="text-slate-500">
                      Batch {extractionProgress.batch} of {extractionProgress.totalBatches}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${(extractionProgress.batch / extractionProgress.totalBatches) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{extractionProgress.questionsExtracted} questions extracted so far</span>
                    <span>{Math.round((extractionProgress.batch / extractionProgress.totalBatches) * 100)}% complete</span>
                  </div>
                </div>
              )}
              <div className="flex justify-end w-full">
                <Button 
                  onClick={handleExtractQuestions} 
                  disabled={pdfPages.length === 0 || isParsingPdf || isExtracting}
                >
                  {isExtracting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isExtracting ? 'Extracting Questions...' : 'Extract Questions'}
                </Button>
              </div>
            </CardFooter>
          </Card>
        )}

        {/* EXTRACTING STATE */}
        {state === 'extracting' && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
              <p className="text-slate-600 font-medium">Extracting questions from PDF...</p>
              <p className="text-sm text-slate-500 mt-2">This may take a moment</p>
            </CardContent>
          </Card>
        )}

        {/* READY STATE */}
        {state === 'ready' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quiz Ready</CardTitle>
              <CardDescription>Review the extracted questions before starting</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="text-green-600" size={24} />
                  <div className="flex-1">
                    <p className="font-medium text-green-900">Successfully extracted {questions.length} questions</p>
                    <p className="text-sm text-green-700 mt-1">
                      From {pdfPages.length} PDF pages • Quiz will randomly select {Math.min(90, questions.length)} questions
                    </p>
                    <div className="mt-2 flex gap-4 text-xs text-green-600">
                      <span>Total Questions: <strong>{questions.length}</strong></span>
                      <span>PDF Pages: <strong>{pdfPages.length}</strong></span>
                      <span>Quiz Questions: <strong>{Math.min(90, questions.length)}</strong> (randomly selected)</span>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                  {questions.map((q, idx) => (
                    <div key={q.id} className="p-3 border border-slate-200 rounded-lg text-sm">
                      <div className="font-medium text-slate-700 mb-1">
                        Q{q.id}: {q.question.substring(0, 60)}{q.question.length > 60 ? '...' : ''}
                      </div>
                      <div className="text-xs text-slate-500">
                        Correct Answer: {q.correctAnswer}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={resetQuiz}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Upload New PDF
              </Button>
              <Button onClick={startQuiz}>
                <Play className="mr-2 h-4 w-4" />
                Start Quiz
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* TAKING QUIZ STATE */}
        {state === 'taking' && currentQuestion && (
          <div className="space-y-6">
            {/* Progress Bar */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <Badge variant="outline" className="text-sm">
                      Question {currentQuestionIndex + 1} of {activeQuestions.length}
                    </Badge>
                    <Badge variant="outline" className="text-sm">
                      Page {currentPage} of {totalPages}
                    </Badge>
                    <Badge variant="outline" className="text-sm">
                      <Clock className="mr-1 h-3 w-3" />
                      {formatTime(timeElapsed)}
                    </Badge>
                    <Badge variant="outline" className="text-sm">
                      {answeredCount} answered
                    </Badge>
                    <Badge variant="outline" className="text-sm">
                      {activeQuestions.length} questions • {questions.length} total available
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={finishQuiz}>
                    Finish Quiz
                  </Button>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mb-4">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${((currentQuestionIndex + 1) / activeQuestions.length) * 100}%` }}
                  />
                </div>
                
                {/* Page Navigation */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-2 pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToPrevPage}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Prev Page
                      </Button>
                      
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          
                          return (
                            <button
                              key={pageNum}
                              onClick={() => goToPage(pageNum)}
                              className={cn(
                                "w-8 h-8 rounded text-sm font-medium transition-all",
                                pageNum === currentPage
                                  ? "bg-blue-600 text-white"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              )}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        {totalPages > 5 && currentPage < totalPages - 2 && (
                          <>
                            <span className="px-2 text-slate-500">...</span>
                            <button
                              onClick={() => goToPage(totalPages)}
                              className="w-8 h-8 rounded text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200"
                            >
                              {totalPages}
                            </button>
                          </>
                        )}
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToNextPage}
                        disabled={currentPage === totalPages}
                      >
                        Next Page
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span>Questions per page:</span>
                      <select
                        value={questionsPerPage}
                        onChange={(e) => {
                          const newPerPage = parseInt(e.target.value);
                          setQuestionsPerPage(newPerPage);
                          // Adjust current question index to stay on same question if possible
                          const newPage = Math.floor(currentQuestionIndex / newPerPage) + 1;
                          goToPage(newPage);
                        }}
                        className="px-2 py-1 border border-slate-300 rounded text-sm"
                      >
                        <option value="5">5</option>
                        <option value="10">10</option>
                        <option value="20">20</option>
                        <option value="50">50</option>
                      </select>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Question Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">
                  Question {currentQuestion.id}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-lg text-slate-800 leading-relaxed">
                  {currentQuestion.question}
                </p>
                
                <div className="space-y-3 mt-6">
                  {(['A', 'B', 'C', 'D'] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => handleAnswerSelect(option)}
                      className={cn(
                        "w-full text-left p-4 rounded-lg border-2 transition-all",
                        answers[currentQuestionIndex] === option
                          ? "border-blue-600 bg-blue-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center font-medium text-sm",
                          answers[currentQuestionIndex] === option
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-300 text-slate-600"
                        )}>
                          {option}
                        </div>
                        <span className="flex-1 text-slate-800">{currentQuestion.options[option]}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t pt-4">
                <Button
                  variant="outline"
                  onClick={() => goToQuestion(currentQuestionIndex - 1)}
                  disabled={currentQuestionIndex === 0}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>
                
                {/* Question navigation for current page */}
                <div className="flex gap-1 flex-wrap justify-center max-w-2xl">
                  {questionsOnCurrentPage.map((_, idx) => {
                    const questionIdx = startQuestionIndex + idx;
                    const isAnswered = answers[questionIdx] !== undefined;
                    return (
                      <button
                        key={questionIdx}
                        onClick={() => goToQuestion(questionIdx)}
                        className={cn(
                          "w-8 h-8 rounded text-sm font-medium transition-all",
                          questionIdx === currentQuestionIndex
                            ? "bg-blue-600 text-white ring-2 ring-blue-300"
                            : isAnswered
                              ? "bg-green-100 text-green-700 border border-green-300 hover:bg-green-200"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300"
                        )}
                        title={`Question ${questionIdx + 1}${isAnswered ? ' (answered)' : ''}`}
                      >
                        {questionIdx + 1}
                      </button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  onClick={() => goToQuestion(currentQuestionIndex + 1)}
                  disabled={currentQuestionIndex === activeQuestions.length - 1}
                >
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* REVIEW STATE */}
        {state === 'review' && showResults && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Award className="text-yellow-500" size={28} />
                  Quiz Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
                    <div className="text-3xl font-bold text-blue-600">{score}%</div>
                    <div className="text-sm text-blue-700 mt-1">Score</div>
                  </div>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                    <div className="text-3xl font-bold text-green-600">{correctCount}</div>
                    <div className="text-sm text-green-700 mt-1">Correct</div>
                  </div>
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
                    <div className="text-3xl font-bold text-red-600">{activeQuestions.length - correctCount}</div>
                    <div className="text-sm text-red-700 mt-1">Incorrect</div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {activeQuestions.map((q, idx) => {
                    const userAnswer = answers[idx];
                    const isCorrect = userAnswer === q.correctAnswer;
                    
                    return (
                      <Card key={q.id} className={cn(
                        "border-2",
                        isCorrect ? "border-green-300 bg-green-50/50" : "border-red-300 bg-red-50/50"
                      )}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800">Question {q.id}</span>
                              {isCorrect ? (
                                <Badge className="bg-green-600">Correct</Badge>
                              ) : (
                                <Badge variant="destructive">Incorrect</Badge>
                              )}
                            </div>
                          </div>
                          
                          <p className="text-slate-800 mb-4">{q.question}</p>
                          
                          <div className="space-y-2">
                            {(['A', 'B', 'C', 'D'] as const).map((option) => {
                              const isUserAnswer = userAnswer === option;
                              const isCorrectAnswer = q.correctAnswer === option;
                              
                              return (
                                <div
                                  key={option}
                                  className={cn(
                                    "p-3 rounded-lg border-2 flex items-start gap-3",
                                    isCorrectAnswer && "bg-green-100 border-green-300",
                                    isUserAnswer && !isCorrectAnswer && "bg-red-100 border-red-300"
                                  )}
                                >
                                  <div className={cn(
                                    "flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center font-medium text-sm",
                                    isCorrectAnswer ? "border-green-600 bg-green-600 text-white" : "border-slate-300"
                                  )}>
                                    {option}
                                  </div>
                                  <span className="flex-1 text-slate-800">{q.options[option]}</span>
                                  {isCorrectAnswer && (
                                    <CheckCircle2 className="text-green-600 flex-shrink-0" size={20} />
                                  )}
                                  {isUserAnswer && !isCorrectAnswer && (
                                    <X className="text-red-600 flex-shrink-0" size={20} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          
                          {q.explanation && (
                            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <p className="text-sm font-medium text-blue-900 mb-1">Explanation:</p>
                              <p className="text-sm text-blue-800">{q.explanation}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-3">
                <Button variant="outline" onClick={resetQuiz}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Start New Quiz
                </Button>
                <Button onClick={() => {
                  setState('taking');
                  setShowResults(false);
                  setCurrentQuestionIndex(0);
                }}>
                  Review Questions
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Quiz;

