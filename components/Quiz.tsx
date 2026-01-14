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
  
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, 'A' | 'B' | 'C' | 'D' | null>>({});
  const [showResults, setShowResults] = useState(false);
  const [timeStarted, setTimeStarted] = useState<number | null>(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  
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
    
    try {
      // Get Firebase auth token
      if (!currentUser) {
        throw new Error('You must be logged in to extract questions');
      }
      
      const token = await currentUser.getIdToken();
      
      const result = await extractQuestionsFromPdf(pdfPages, token);
      
      if (result.questions && result.questions.length > 0) {
        setQuestions(result.questions);
        setState('ready');
      } else {
        setExtractError('No questions found in the PDF. Please ensure the PDF contains questions and answers.');
      }
    } catch (error: any) {
      console.error('Error extracting questions:', error);
      
      // Handle quota errors with better formatting
      if (error.type === 'quota_exceeded' || error.message?.includes('quota')) {
        const errorMsg = error.message || 'API quota exceeded';
        setExtractError(errorMsg);
      } else {
        setExtractError(error.message || 'Failed to extract questions from PDF. Please try again.');
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const startQuiz = () => {
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
    if (index >= 0 && index < questions.length) {
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

  const currentQuestion = questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;
  const correctCount = questions.filter((q, idx) => answers[idx] === q.correctAnswer).length;
  const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

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
            <CardFooter className="flex justify-end gap-3">
              <Button 
                onClick={handleExtractQuestions} 
                disabled={pdfPages.length === 0 || isParsingPdf || isExtracting}
              >
                {isExtracting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isExtracting ? 'Extracting Questions...' : 'Extract Questions'}
              </Button>
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
                  <div>
                    <p className="font-medium text-green-900">Successfully extracted {questions.length} questions</p>
                    <p className="text-sm text-green-700">Click "Start Quiz" to begin the exam simulator</p>
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
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="text-sm">
                      Question {currentQuestionIndex + 1} of {questions.length}
                    </Badge>
                    <Badge variant="outline" className="text-sm">
                      <Clock className="mr-1 h-3 w-3" />
                      {formatTime(timeElapsed)}
                    </Badge>
                    <Badge variant="outline" className="text-sm">
                      {answeredCount} answered
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={finishQuiz}>
                    Finish Quiz
                  </Button>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                  />
                </div>
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
                
                <div className="flex gap-2">
                  {questions.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => goToQuestion(idx)}
                      className={cn(
                        "w-8 h-8 rounded text-sm font-medium transition-all",
                        idx === currentQuestionIndex
                          ? "bg-blue-600 text-white"
                          : answers[idx]
                            ? "bg-green-100 text-green-700 border border-green-300"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
                
                <Button
                  variant="outline"
                  onClick={() => goToQuestion(currentQuestionIndex + 1)}
                  disabled={currentQuestionIndex === questions.length - 1}
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
                    <div className="text-3xl font-bold text-red-600">{questions.length - correctCount}</div>
                    <div className="text-sm text-red-700 mt-1">Incorrect</div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {questions.map((q, idx) => {
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

