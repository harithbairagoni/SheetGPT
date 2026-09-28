'use client';

import { useCallback, useRef, useState, type DragEvent } from 'react';
import Papa from 'papaparse';
import {
  UploadCloud,
  FileSpreadsheet,
  X,
  Table2,
  Columns3,
  Rows3,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Wand2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  transformColumn,
  TRANSFORM_LABELS,
  type TransformRule,
} from '@/lib/transforms';

interface CsvData {
  fileName: string;
  fileSize: number;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  errors: number;
}

const MAX_DISPLAY_ROWS = 50;
const TRANSFORM_RULES: TransformRule[] = [
  'uppercase',
  'lowercase',
  'titlecase',
  'extract_email',
];

const AI_SUGGESTIONS = [
  'Standardize all phone numbers to (XXX) XXX-XXXX format',
  'Fix common typos and spelling mistakes',
  'Normalize all dates to YYYY-MM-DD',
  'Remove extra whitespace and trim all fields',
  'Standardize state names to two-letter abbreviations',
  'Fill empty cells with "N/A"',
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function inferColumnType(values: string[]): {
  type: string;
  empties: number;
  nulls: number;
} {
  let empties = 0;
  let nulls = 0;
  let isNumeric = true;
  let isBoolean = true;
  let isDate = true;

  for (const val of values) {
    const trimmed = val.trim();
    if (trimmed === '') {
      empties++;
      continue;
    }
    if (
      trimmed.toLowerCase() === 'null' ||
      trimmed.toLowerCase() === 'na' ||
      trimmed.toLowerCase() === 'n/a' ||
      trimmed === '-'
    ) {
      nulls++;
      continue;
    }
    if (isNumeric && isNaN(Number(trimmed))) {
      isNumeric = false;
    }
    if (
      isBoolean &&
      !['true', 'false', 'yes', 'no', '0', '1'].includes(trimmed.toLowerCase())
    ) {
      isBoolean = false;
    }
    if (isDate && isNaN(Date.parse(trimmed))) {
      isDate = false;
    }
  }

  let type = 'text';
  if (isNumeric) type = 'number';
  else if (isBoolean) type = 'boolean';
  else if (isDate) type = 'date';

  return { type, empties, nulls };
}

export default function Home() {
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [appliedTransforms, setAppliedTransforms] = useState<
    Record<string, TransformRule[]>
  >({});
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiSelectedColumns, setAiSelectedColumns] = useState<Set<string>>(
    new Set()
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAppliedCount, setAiAppliedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseError('Please upload a .csv file');
      setCsvData(null);
      return;
    }

    setParseError(null);
    setIsParsing(true);
    setAppliedTransforms({});
    setAiAppliedCount(0);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const allRows = results.data;
        const displayRows = allRows.slice(0, MAX_DISPLAY_ROWS);

        setCsvData({
          fileName: file.name,
          fileSize: file.size,
          headers,
          rows: displayRows,
          totalRows: allRows.length,
          errors: results.errors.length,
        });
        setIsParsing(false);
      },
      error: (err) => {
        setParseError(err.message);
        setIsParsing(false);
      },
    });
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleRemoveFile = useCallback(() => {
    setCsvData(null);
    setParseError(null);
    setAppliedTransforms({});
    setAiAppliedCount(0);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleApplyTransform = useCallback(
    (header: string, rule: TransformRule) => {
      setCsvData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: transformColumn(prev.rows, header, rule),
        };
      });
      setAppliedTransforms((prev) => ({
        ...prev,
        [header]: [...(prev[header] ?? []), rule],
      }));
    },
    []
  );

  const openAiDialog = useCallback(() => {
    if (csvData) {
      setAiSelectedColumns(new Set(csvData.headers));
    }
    setAiInstruction('');
    setAiError(null);
    setAiDialogOpen(true);
  }, [csvData]);

  const toggleColumnSelection = useCallback((header: string) => {
    setAiSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(header)) {
        next.delete(header);
      } else {
        next.add(header);
      }
      return next;
    });
  }, []);

  const handleAiClean = useCallback(async () => {
    if (!csvData || !aiInstruction.trim() || aiSelectedColumns.size === 0) return;

    setAiLoading(true);
    setAiError(null);

    try {
      const columns = Array.from(aiSelectedColumns).map((header) => ({
        header,
        values: csvData.rows.map((r) => r[header] ?? ''),
      }));

      const res = await fetch('/api/ai-clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns,
          instruction: aiInstruction.trim(),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setAiError(result.error || 'AI cleaning failed');
        setAiLoading(false);
        return;
      }

      const cleanedMap: Record<string, string[]> = {};
      for (const col of result.columns) {
        cleanedMap[col.header] = col.values;
      }

      setCsvData((prev) => {
        if (!prev) return prev;
        const newRows = prev.rows.map((row, rowIdx) => {
          const updated = { ...row };
          for (const header of Object.keys(cleanedMap)) {
            const cleanedValues = cleanedMap[header];
            if (cleanedValues[rowIdx] !== undefined) {
              updated[header] = String(cleanedValues[rowIdx]);
            }
          }
          return updated;
        });
        return { ...prev, rows: newRows };
      });

      setAiAppliedCount((c) => c + 1);
      setAiDialogOpen(false);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setAiLoading(false);
    }
  }, [csvData, aiInstruction, aiSelectedColumns]);

  // Build column stats for the loaded data
  const columnStats = csvData
    ? csvData.headers.map((header) => {
        const sampleValues = csvData.rows.map((r) => r[header] ?? '');
        return inferColumnType(sampleValues);
      })
    : [];

  const totalEmptyCells = columnStats.reduce(
    (sum, s) => sum + s.empties + s.nulls,
    0
  );

  const totalTransforms = Object.values(appliedTransforms).reduce(
    (sum, rules) => sum + rules.length,
    0
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Table2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                CSV Data Cleaner
              </h1>
              <p className="text-xs text-muted-foreground">
                Inspect & clean your data
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {csvData && (
              <Button
                size="sm"
                onClick={openAiDialog}
                className="gap-1.5 bg-gradient-to-r from-primary to-chart-1 text-primary-foreground hover:opacity-90"
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI Clean
              </Button>
            )}
            {csvData && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveFile}
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Remove file
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {!csvData ? (
          /* Upload State */
          <div className="flex flex-col items-center pt-12 animate-fade-in">
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <FileSpreadsheet className="h-3 w-3" />
                CSV files only
              </Badge>
            </div>
            <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
              Clean up your CSV data
            </h2>
            <p className="mb-8 max-w-md text-center text-muted-foreground">
              Drag and drop a CSV file to instantly preview its contents, inspect
              column types, and identify data quality issues.
            </p>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'group relative flex h-72 w-full max-w-2xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300',
                isDragging
                  ? 'scale-[1.02] border-primary bg-accent/60'
                  : 'border-border bg-card hover:border-primary/50 hover:bg-accent/30'
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />

              <div
                className={cn(
                  'mb-4 flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300',
                  isDragging
                    ? 'scale-110 bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                )}
              >
                <UploadCloud className="h-8 w-8" />
              </div>

              <p className="text-lg font-medium">
                {isDragging ? 'Drop your file here' : 'Drag & drop your CSV'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                or <span className="text-primary font-medium">browse</span> to
                choose a file
              </p>

              {isParsing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-background/80 backdrop-blur-sm">
                  <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Parsing your data...
                  </p>
                </div>
              )}
            </div>

            {parseError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-slide-up">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {parseError}
              </div>
            )}

            {/* Feature hints */}
            <div className="mt-12 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Table2,
                  title: 'Instant preview',
                  desc: 'See your first 50 rows immediately',
                },
                {
                  icon: Columns3,
                  title: 'Column insights',
                  desc: 'Automatic type detection per column',
                },
                {
                  icon: Sparkles,
                  title: 'AI-powered cleaning',
                  desc: 'Clean data with natural language instructions',
                },
              ].map((feature, i) => (
                <div
                  key={feature.title}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card p-5 text-center animate-slide-up"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <feature.icon className="h-5 w-5 text-primary" />
                  <p className="text-sm font-medium">{feature.title}</p>
                  <p className="text-xs text-muted-foreground">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Data Loaded State */
          <div className="animate-fade-in">
            {/* File info banner */}
            <Card className="mb-6 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold tracking-tight">
                      {csvData.fileName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatBytes(csvData.fileSize)} • {csvData.totalRows} rows •{' '}
                      {csvData.headers.length} columns
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {csvData.errors > 0 ? (
                    <Badge variant="destructive" className="gap-1.5">
                      <AlertTriangle className="h-3 w-3" />
                      {csvData.errors} parse {csvData.errors === 1 ? 'error' : 'errors'}
                    </Badge>
                  ) : (
                    <Badge className="gap-1.5 bg-success text-success-foreground hover:bg-success/80">
                      <CheckCircle2 className="h-3 w-3" />
                      Parsed cleanly
                    </Badge>
                  )}
                  {totalEmptyCells > 0 && (
                    <Badge variant="secondary" className="gap-1.5">
                      <AlertTriangle className="h-3 w-3" />
                      {totalEmptyCells} empty cells
                    </Badge>
                  )}
                  {totalTransforms > 0 && (
                    <Badge className="gap-1.5 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15">
                      <Wand2 className="h-3 w-3" />
                      {totalTransforms} {totalTransforms === 1 ? 'transform' : 'transforms'} applied
                    </Badge>
                  )}
                  {aiAppliedCount > 0 && (
                    <Badge className="gap-1.5 bg-gradient-to-r from-primary to-chart-1 text-primary-foreground">
                      <Sparkles className="h-3 w-3" />
                      {aiAppliedCount} AI {aiAppliedCount === 1 ? 'clean' : 'cleans'}
                    </Badge>
                  )}
                  {csvData.totalRows > MAX_DISPLAY_ROWS && (
                    <Badge variant="outline" className="gap-1.5">
                      <Rows3 className="h-3 w-3" />
                      Showing first {MAX_DISPLAY_ROWS}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>

            {/* Stats row */}
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                icon={<Rows3 className="h-4 w-4" />}
                label="Total Rows"
                value={csvData.totalRows.toLocaleString()}
              />
              <StatCard
                icon={<Columns3 className="h-4 w-4" />}
                label="Columns"
                value={csvData.headers.length.toLocaleString()}
              />
              <StatCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Data Quality"
                value={
                  totalEmptyCells === 0 && csvData.errors === 0
                    ? '100%'
                    : `${Math.round(
                        (1 -
                          totalEmptyCells /
                            (csvData.totalRows * csvData.headers.length || 1)) *
                          100
                      )}%`
                }
              />
              <StatCard
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Empty Cells"
                value={totalEmptyCells.toLocaleString()}
              />
            </div>

            {/* AI Clean action bar */}
            <Card className="mb-6 border-primary/20 bg-gradient-to-r from-accent/40 to-transparent p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-chart-1 text-primary-foreground">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">AI-Powered Cleaning</p>
                    <p className="text-xs text-muted-foreground">
                      Clean your data using natural language instructions
                    </p>
                  </div>
                </div>
                <Button
                  onClick={openAiDialog}
                  size="sm"
                  className="gap-1.5 bg-gradient-to-r from-primary to-chart-1 text-primary-foreground hover:opacity-90"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Open AI Cleaner
                </Button>
              </div>
            </Card>

            {/* Column type summary */}
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Column Types
              </h3>
              <div className="flex flex-wrap gap-2">
                {csvData.headers.map((header, i) => {
                  const stat = columnStats[i];
                  const typeColors: Record<string, string> = {
                    number: 'bg-primary/10 text-primary border-primary/20',
                    boolean: 'bg-chart-2/10 text-chart-2 border-chart-2/20',
                    date: 'bg-chart-3/10 text-chart-3 border-chart-3/20',
                    text: 'bg-muted text-muted-foreground border-border',
                  };
                  return (
                    <div
                      key={header}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium animate-scale-in',
                        typeColors[stat.type] ?? typeColors.text
                      )}
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <span className="font-semibold">{header}</span>
                      <Separator orientation="vertical" className="h-3" />
                      <span className="uppercase opacity-70">{stat.type}</span>
                      {appliedTransforms[header]?.length > 0 && (
                        <>
                          <Separator orientation="vertical" className="h-3" />
                          <span className="flex items-center gap-1 text-primary">
                            <Wand2 className="h-2.5 w-2.5" />
                            {appliedTransforms[header].length}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Data table */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Data Preview
                </h3>
                <span className="text-xs text-muted-foreground">
                  {Math.min(csvData.rows.length, MAX_DISPLAY_ROWS)} of{' '}
                  {csvData.totalRows.toLocaleString()} rows
                </span>
              </div>
              <Card className="overflow-hidden p-0">
                <div className="max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-12 text-center text-xs font-semibold text-muted-foreground/60">
                          #
                        </TableHead>
                        {csvData.headers.map((header) => {
                          const transforms = appliedTransforms[header] ?? [];
                          return (
                            <TableHead
                              key={header}
                              className="whitespace-nowrap text-xs font-semibold p-0"
                            >
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="group/header flex w-full items-center gap-1.5 px-4 py-3 text-left transition-colors hover:bg-accent/50">
                                    <span>{header}</span>
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-data-[state=open]/header:rotate-180" />
                                    {transforms.length > 0 && (
                                      <span className="flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[10px] font-semibold text-primary">
                                        <Wand2 className="h-2.5 w-2.5" />
                                        {transforms.length}
                                      </span>
                                    )}
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-52">
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                                    Transform column
                                  </DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {TRANSFORM_RULES.map((rule) => {
                                    const isApplied = transforms.includes(rule);
                                    return (
                                      <DropdownMenuItem
                                        key={rule}
                                        onClick={() => handleApplyTransform(header, rule)}
                                        className="gap-2 text-sm"
                                      >
                                        <span
                                          className={cn(
                                            'flex h-4 w-4 items-center justify-center rounded',
                                            isApplied
                                              ? 'bg-primary/15 text-primary'
                                              : 'text-muted-foreground/40'
                                          )}
                                        >
                                          {isApplied && (
                                            <CheckCircle2 className="h-3 w-3" />
                                          )}
                                        </span>
                                        {TRANSFORM_LABELS[rule]}
                                      </DropdownMenuItem>
                                    );
                                  })}
                                  {transforms.length > 0 && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                                        {transforms.length} {transforms.length === 1 ? 'rule' : 'rules'} applied to this column
                                      </div>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvData.rows.map((row, rowIndex) => (
                        <TableRow key={rowIndex} className="group/row">
                          <TableCell className="w-12 text-center text-xs text-muted-foreground/50 group-hover/row:text-muted-foreground">
                            {rowIndex + 1}
                          </TableCell>
                          {csvData.headers.map((header) => {
                            const value = row[header] ?? '';
                            const isEmpty =
                              value.trim() === '' ||
                              ['null', 'na', 'n/a', '-'].includes(
                                value.trim().toLowerCase()
                              );
                            return (
                              <TableCell
                                key={header}
                                className="whitespace-nowrap text-sm"
                              >
                                {isEmpty ? (
                                  <span className="text-muted-foreground/40 italic">
                                    —
                                  </span>
                                ) : (
                                  <span className="text-foreground/90">
                                    {value}
                                  </span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
              <p className="mt-3 text-xs text-muted-foreground">
                Click any column header to apply a transformation rule, or use AI Clean for natural-language cleaning.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* AI Clean Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-chart-1 text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <DialogTitle>AI Data Cleaner</DialogTitle>
            </div>
            <DialogDescription>
              Describe how you want to clean your data. The AI will apply your
              instruction to the selected columns.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Column selection */}
            <div>
              <label className="mb-2 block text-sm font-medium">
                Columns to clean
              </label>
              <div className="flex flex-wrap gap-2">
                {csvData?.headers.map((header) => {
                  const selected = aiSelectedColumns.has(header);
                  return (
                    <button
                      key={header}
                      onClick={() => toggleColumnSelection(header)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted text-muted-foreground hover:border-primary/40'
                      )}
                    >
                      {selected && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                      {header}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Instruction input */}
            <div>
              <label className="mb-2 block text-sm font-medium">
                Cleaning instruction
              </label>
              <Textarea
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder="e.g. Standardize all phone numbers to (XXX) XXX-XXXX format"
                className="min-h-[80px] resize-none"
                disabled={aiLoading}
              />
            </div>

            {/* Suggestions */}
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Try one of these:</p>
              <div className="flex flex-wrap gap-2">
                {AI_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setAiInstruction(suggestion)}
                    disabled={aiLoading}
                    className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            {aiError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {aiError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAiDialogOpen(false)}
              disabled={aiLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAiClean}
              disabled={
                aiLoading ||
                !aiInstruction.trim() ||
                aiSelectedColumns.size === 0
              }
              className="gap-1.5 bg-gradient-to-r from-primary to-chart-1 text-primary-foreground hover:opacity-90"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cleaning...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Apply AI Clean
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="mt-8 border-t border-border/60 py-6">
        <p className="text-center text-xs text-muted-foreground">
          CSV Data Cleaner — powered by Gemini AI
        </p>
      </footer>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
    </Card>
  );
}
