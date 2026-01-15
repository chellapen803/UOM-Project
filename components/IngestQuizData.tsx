import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, Loader2, CheckCircle2, X, AlertCircle
} from 'lucide-react';
import { extractContentFromPdf, PdfPage } from '../services/pdfService';
import { extractQuestionsFromPdf, QuizQuestion } from '../services/quizService';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Alert, AlertTitle, AlertDescription } from './ui';
import { useAuth } from '../contexts/AuthContext';

const IngestQuizData = () => {
  const { currentUser } = useAuth();
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
  const [extractionComplete, setExtractionComplete] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFileName(file.name);
    setIsParsingPdf(true);
    setPdfPages([]);
    setExtractError('');
    setExtractionComplete(false);
    setQuestions([]);
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
    setExtractionComplete(false);
    
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
        setExtractionComplete(true);
        
        // Show message if questions were loaded from cache
        if (result.cached) {
          console.log(`Loaded ${result.questions.length} questions from database`);
        }
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

  const resetForm = () => {
    setPdfFileName('');
    setPdfPages([]);
    setQuestions([]);
    setExtractionComplete(false);
    setExtractError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="text-blue-600" size={28} />
            Ingest Quiz Data
          </h2>
          <p className="text-slate-500 mt-1">Upload a PDF with questions to extract and save quiz questions</p>
        </div>

        {/* Upload Section */}
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
                        onClick={resetForm}
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
            <div className="flex justify-end w-full gap-3">
              {extractionComplete && (
                <Button variant="outline" onClick={resetForm}>
                  <X className="mr-2 h-4 w-4" />
                  Upload New PDF
                </Button>
              )}
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

        {/* Results Section */}
        {extractionComplete && questions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Extraction Complete</CardTitle>
              <CardDescription>Questions have been saved to the database</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="text-green-600" size={24} />
                  <div className="flex-1">
                    <p className="font-medium text-green-900">Successfully extracted {questions.length} questions</p>
                    <p className="text-sm text-green-700 mt-1">
                      From {pdfPages.length} PDF pages • Questions are now available for all users
                    </p>
                    <div className="mt-2 flex gap-4 text-xs text-green-600">
                      <span>Total Questions: <strong>{questions.length}</strong></span>
                      <span>PDF Pages: <strong>{pdfPages.length}</strong></span>
                      <span>Quiz Questions: <strong>{Math.min(90, questions.length)}</strong> (randomly selected per quiz)</span>
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
          </Card>
        )}
      </div>
    </div>
  );
};

export default IngestQuizData;

