import { NextRequest, NextResponse } from 'next/server';

const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface ColumnData {
  header: string;
  values: string[];
}

interface RequestBody {
  columns: ColumnData[];
  instruction: string;
}

interface GeminiCleanedColumn {
  header: string;
  values: string[];
}

export async function POST(req: NextRequest) {
  try {
    const { columns, instruction } = (await req.json()) as RequestBody;

    if (!columns || !Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json(
        { error: 'No columns provided' },
        { status: 400 }
      );
    }

    if (!instruction || instruction.trim() === '') {
      return NextResponse.json(
        { error: 'No cleaning instruction provided' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is not configured' },
        { status: 500 }
      );
    }

    const csvPreview = columns
      .map((col) => `${col.header}: ${col.values.join(', ')}`)
      .join('\n');

    const prompt = `You are a data cleaning assistant. You will receive CSV column data and a cleaning instruction.
Apply the instruction to every value in each column and return the cleaned values.

Cleaning instruction: "${instruction}"

Column data (header: value1, value2, ...):
${csvPreview}

Return ONLY a JSON array where each element has "header" (the column name) and "values" (an array of cleaned string values, same length as input).
Do not include any explanation, markdown, or code fences. Return only the raw JSON array.

Example output:
[{"header":"name","values":["John Doe","Jane Smith"]},{"header":"email","values":["john@example.com","jane@example.com"]}]`;

    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Gemini API returned status ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!text) {
      return NextResponse.json(
        { error: 'Gemini returned an empty response' },
        { status: 502 }
      );
    }

    let cleanedColumns: GeminiCleanedColumn[];
    try {
      cleanedColumns = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return NextResponse.json(
          { error: 'Could not parse Gemini response as JSON' },
          { status: 502 }
        );
      }
      cleanedColumns = JSON.parse(jsonMatch[0]);
    }

    if (!Array.isArray(cleanedColumns)) {
      return NextResponse.json(
        { error: 'Gemini response was not an array' },
        { status: 502 }
      );
    }

    return NextResponse.json({ columns: cleanedColumns });
  } catch (err) {
    console.error('AI clean error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
