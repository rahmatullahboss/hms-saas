/**
 * PDF Import Modal for Shareholder Data
 * 
 * Allows hospital admin to upload PDF forms and import shareholder data
 * Supports Bengali number parsing and multiple form formats
 */

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, Check, X, AlertTriangle, AlertCircle, Loader2, Download, Trash2 } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { parseShareholderPDF, validateParsedShareholder, previewParsedData, ParsedShareholder } from '../../lib/shareholderPdfParser';
import { useTranslation } from 'react-i18next';

// PDF.js types
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const PDFJS_LOAD_TIMEOUT = 15000; // 15 seconds

interface PdfImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ImportResult {
  row: number;
  status: 'imported' | 'skipped' | 'failed';
  message: string;
  id?: number;
  name: string;
}

export default function PdfImportModal({ isOpen, onClose, onImportComplete }: PdfImportModalProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'result'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedShareholder[]>([]);
  const [previewRows, setPreviewRows] = useState<ReturnType<typeof previewParsedData>>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);
  const [pdfText, setPdfText] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation(['accounting', 'common']);

  const loadPdfJs = useCallback(async (): Promise<any> => {
    if (window.pdfjsLib) return window.pdfjsLib;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('PDF.js load timeout — check internet connection'));
      }, PDFJS_LOAD_TIMEOUT);

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      
      script.onload = () => {
        clearTimeout(timeout);
        try {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } catch (err) {
          reject(new Error('PDF.js initialization failed'));
        }
      };
      
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('PDF.js download failed — check internet connection'));
      };
      
      document.head.appendChild(script);
    });
  }, []);

  const extractTextFromPdf = useCallback(async (file: File): Promise<{ text: string; pageCount: number }> => {
    const pdfjsLib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: { str: string }) => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    
    return { text: fullText, pageCount: pdf.numPages };
  }, [loadPdfJs]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      toast.error('শুধুমাত্র PDF ফাইল আপলোড করুন (Only PDF files are allowed)');
      return;
    }

    // File size check
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error(`ফাইল সাইজ বেশি (Max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
      return;
    }

    if (selectedFile.size === 0) {
      toast.error('ফাইলটি খালি (Empty file)');
      return;
    }

    setFile(selectedFile);
    setImporting(true);

    try {
      const { text, pageCount } = await extractTextFromPdf(selectedFile);
      setPdfText(text);

      // Scanned PDF detection — no extractable text
      if (!text || text.trim().length < 10) {
        toast.error(`এই PDF এ ${pageCount}টি page আছে কিন্তু কোনো টেক্সট পাওয়া যায়নি। এটি সম্ভবত স্ক্যান করা PDF। OCR software ব্যবহার করুন।`);
        setImporting(false);
        return;
      }

      // Parse the extracted text
      const shareholders = parseShareholderPDF(text);
      setParsedData(shareholders);

      if (shareholders.length === 0) {
        toast.error('PDF থেকে কোনো শেয়ারহোল্ডার ডাটা পাওয়া যায়নি');
        setImporting(false);
        return;
      }

      // Generate preview
      const preview = previewParsedData(shareholders);
      setPreviewRows(preview);

      setStep('preview');
    } catch (error) {
      console.error('PDF parsing error:', error);
      toast.error(error instanceof Error ? error.message : 'PDF পড়তে সমস্যা হয়েছে (Error reading PDF)');
    } finally {
      setImporting(false);
    }
  }, [extractTextFromPdf]);

  const handleImport = useCallback(async () => {
    if (parsedData.length === 0) return;

    setStep('importing');
    setImporting(true);

    try {
      // Prepare data for API
      const shareholdersToImport = parsedData.map(sh => ({
        name: sh.name,
        phone: sh.phone,
        nid: sh.nid,
        shareCount: sh.shareCount,
        type: sh.type,
        address: sh.address,
        email: sh.email,
        nomineeName: sh.nomineeName,
        nomineeContact: sh.nomineeContact,
        shareValueBdt: sh.shareValueBdt,
        investment: sh.investment,
      }));

      const response = await axios.post('/api/shareholders/bulk-import', {
        shareholders: shareholdersToImport,
        skipDuplicates,
      });

      setImportResults(response.data.results);
      setStep('result');

      const { imported, skipped, failed } = response.data.summary;
      if (imported > 0) {
        toast.success(`${imported} জন শেয়ারহোল্ডার ইম্পোর্ট হয়েছে`);
        onImportComplete();
      }
      if (failed > 0) {
        toast.error(`${failed} জন ইম্পোর্ট হয়নি`);
      }
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.response?.data?.message || 'ইম্পোর্ট করতে সমস্যা হয়েছে');
      setStep('preview');
    } finally {
      setImporting(false);
    }
  }, [parsedData, skipDuplicates, onImportComplete]);

  const handleReset = useCallback(() => {
    setFile(null);
    setParsedData([]);
    setPreviewRows([]);
    setImportResults([]);
    setPdfText('');
    setStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleDownloadSample = useCallback(() => {
    // Create sample CSV for reference
    const sampleData = `নাম,ফোন,NID,শেয়ার,টাইপ,ঠিকানা,নমিনী
মোঃ সিদ্দীকুমার,01774777641,671685583367074,20,investor,"পূর্ববাসন, নারায়ণগঞ্জ",মোঃ সিদ্দীকুমার আব্দুল কাম
মোঃ করিম উদ্দিন,01812345678,1234567890123,15,owner,"ঢাকা",মোঃ রহিম উদ্দিন`;

    const blob = new Blob(['\ufeff' + sampleData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shareholder_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <div>
            <h3 className="font-semibold text-lg">PDF থেকে শেয়ারহোল্ডার ইম্পোর্ট</h3>
            <p className="text-sm text-[var(--color-text-muted)]">PDF ফরম আপলোড করে শেয়ারহোল্ডার ডাটা ইম্পোর্ট করুন</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Close modal">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Upload Area */}
              <div
                className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-8 text-center hover:border-[var(--color-primary)] transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {importing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-12 h-12 text-[var(--color-primary)] animate-spin" />
                    <p className="text-[var(--color-text-muted)]">PDF পড়া হচ্ছে...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
                      <Upload className="w-8 h-8 text-[var(--color-primary)]" />
                    </div>
                    <div>
                      <p className="font-medium">PDF ফাইল আপলোড করুন</p>
                      <p className="text-sm text-[var(--color-text-muted)]">অথবা এখানে ড্র্যাগ করুন</p>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">সমর্থিত: শাহ নেছার হাসপাতাল শেয়ার ফরম</p>
                  </div>
                )}
              </div>

              {/* Sample Format */}
              <div className="bg-[var(--color-surface)] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    সাপোর্টেড ফরম্যাট
                  </h4>
                  <button onClick={handleDownloadSample} className="text-sm text-[var(--color-primary)] hover:underline flex items-center gap-1">
                    <Download className="w-4 h-4" />
                    Sample CSV
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium mb-1">✅ পড়তে পারে:</p>
                    <ul className="list-disc list-inside text-[var(--color-text-muted)] space-y-1">
                      <li>অংশীদারকারীর নাম (বাংলা/ইংরেজি)</li>
                      <li>মোবাইল নম্বর</li>
                      <li>জাতীয় পরিচয় পত্র (NID)</li>
                      <li>শেয়ার সংখ্যা ও মূল্য</li>
                      <li>ঠিকানা</li>
                      <li>নমিনীর তথ্য</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-1">⚠️ সতর্কতা:</p>
                    <ul className="list-disc list-inside text-[var(--color-text-muted)] space-y-1">
                      <li>PDF স্ক্যান করা হলে OCR প্রয়োজন</li>
                      <li>সুস্পষ্ট টেক্সট থাকতে হবে</li>
                      <li>একাধিক ফরম একসাথে আপলোড করা যায়</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* File Info */}
              <div className="flex items-center justify-between bg-[var(--color-surface)] rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-red-500" />
                  <div>
                    <p className="font-medium">{file?.name}</p>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {parsedData.length} জন শেয়ারহোল্ডার পাওয়া গেছে
                    </p>
                  </div>
                </div>
                <button onClick={handleReset} className="btn-ghost text-sm">
                  <Trash2 className="w-4 h-4" /> মুছুন
                </button>
              </div>

              {/* Options */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="checkbox"
                  />
                  <span className="text-sm">ডুপ্লিকেট বাদ দিন (NID/ফোন মিলে গেলে)</span>
                </label>
              </div>

              {/* Preview Table */}
              <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg">
                <table className="table-base text-sm">
                  <thead>
                    <tr className="bg-[var(--color-surface)]">
                      <th className="w-12">#</th>
                      <th>নাম</th>
                      <th>ফোন</th>
                      <th>NID</th>
                      <th className="text-right">শেয়ার</th>
                      <th>ঠিকানা</th>
                      <th>নমিনী</th>
                      <th className="w-20">স্ট্যাটাস</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-[var(--color-text-muted)]">
                          কোনো ডাটা পাওয়া যায়নি
                        </td>
                      </tr>
                    ) : (
                      previewRows.map((row) => (
                        <tr key={row.row} className={row.status === 'error' ? 'bg-red-50 dark:bg-red-900/20' : row.status === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20' : ''}>
                          <td className="text-center text-[var(--color-text-muted)]">{row.row}</td>
                          <td className="font-medium">{row.name}</td>
                          <td>{row.phone}</td>
                          <td className="font-mono text-xs">{row.nid}</td>
                          <td className="text-right font-data">{row.shares}</td>
                          <td className="max-w-[150px] truncate">{row.address}</td>
                          <td className="max-w-[120px] truncate">{row.nominee}</td>
                          <td>
                            {row.status === 'valid' && <Check className="w-5 h-5 text-emerald-500" />}
                            {row.status === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                            {row.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-center">
                  <p className="text-2xl font-bold text-emerald-600">
                    {previewRows.filter(r => r.status === 'valid').length}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">সফল</p>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
                  <p className="text-2xl font-bold text-amber-600">
                    {previewRows.filter(r => r.status === 'warning').length}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">সতর্কতা</p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {previewRows.filter(r => r.status === 'error').length}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">ত্রুটি</p>
                </div>
              </div>

              {/* Warnings */}
              {previewRows.some(r => r.messages.length > 0) && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                  <p className="font-medium text-amber-700 dark:text-amber-300 mb-2">সতর্কতা:</p>
                  <ul className="text-sm text-amber-600 dark:text-amber-400 space-y-1">
                    {previewRows.filter(r => r.messages.length > 0).slice(0, 5).map(r => (
                      <li key={r.row}>• Row {r.row} ({r.name}): {r.messages.join(', ')}</li>
                    ))}
                    {previewRows.filter(r => r.messages.length > 0).length > 5 && (
                      <li>• ...এবং আরও {previewRows.filter(r => r.messages.length > 0).length - 5}টি</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-16 h-16 text-[var(--color-primary)] animate-spin mb-4" />
              <p className="text-lg font-medium">ইম্পোর্ট হচ্ছে...</p>
              <p className="text-sm text-[var(--color-text-muted)]">{parsedData.length} জন শেয়ারহোল্ডার</p>
            </div>
          )}

          {/* Step: Result */}
          {step === 'result' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-center">
                  <p className="text-3xl font-bold text-emerald-600">
                    {importResults.filter(r => r.status === 'imported').length}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">ইম্পোর্ট হয়েছে</p>
                </div>
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
                  <p className="text-3xl font-bold text-amber-600">
                    {importResults.filter(r => r.status === 'skipped').length}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">বাদ পড়েছে</p>
                </div>
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                  <p className="text-3xl font-bold text-red-600">
                    {importResults.filter(r => r.status === 'failed').length}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">ব্যর্থ</p>
                </div>
              </div>

              {/* Results Table */}
              <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg max-h-[300px]">
                <table className="table-base text-sm">
                  <thead className="sticky top-0 bg-[var(--color-surface)]">
                    <tr>
                      <th className="w-12">#</th>
                      <th>নাম</th>
                      <th>স্ট্যাটাস</th>
                      <th>বিবরণ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResults.map((result) => (
                      <tr key={result.row} className={
                        result.status === 'imported' ? '' :
                        result.status === 'skipped' ? 'bg-amber-50 dark:bg-amber-900/20' :
                        'bg-red-50 dark:bg-red-900/20'
                      }>
                        <td className="text-center text-[var(--color-text-muted)]">{result.row}</td>
                        <td className="font-medium">{result.name}</td>
                        <td>
                          {result.status === 'imported' && (
                            <span className="badge badge-success flex items-center gap-1 w-fit">
                              <Check className="w-3 h-3" /> সফল
                            </span>
                          )}
                          {result.status === 'skipped' && (
                            <span className="badge badge-warning flex items-center gap-1 w-fit">
                              <AlertTriangle className="w-3 h-3" /> বাদ
                            </span>
                          )}
                          {result.status === 'failed' && (
                            <span className="badge badge-error flex items-center gap-1 w-fit">
                              <AlertCircle className="w-3 h-3" /> ব্যর্থ
                            </span>
                          )}
                        </td>
                        <td className="text-sm text-[var(--color-text-muted)]">{result.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-[var(--color-border)] flex justify-end gap-3">
          {step === 'upload' && (
            <button onClick={onClose} className="btn-secondary">বন্ধ করুন</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={handleReset} className="btn-secondary">পিছনে</button>
              <button
                onClick={handleImport}
                disabled={parsedData.length === 0 || importing}
                className="btn-primary"
              >
                {importing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> ইম্পোর্ট হচ্ছে...</>
                ) : (
                  <><Upload className="w-4 h-4" /> {parsedData.length} জন ইম্পোর্ট করুন</>
                )}
              </button>
            </>
          )}
          {step === 'result' && (
            <>
              <button onClick={handleReset} className="btn-secondary">আরও আপলোড</button>
              <button onClick={onClose} className="btn-primary">সম্পন্ন</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
