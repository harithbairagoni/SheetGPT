import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-1.5-flash';

interface RequestBody {
  header: string;
  values: string[];
}

interface SentimentResult {
  index: number;
  sentiment: string;
}

export async function POST(req: NextRequest) {
  try {
    const { header, values } = (await req.json()) as RequestBody;

    if (!header || !values || !Array.isArray(values)) {
      return NextResponse.json(
        { error: 'Missing header or values' },
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const rowsText = values
      .map((v, i) => `${i + 1}. "${v}"`)
      .join('\n');

    const prompt = `You are a sentiment analysis assistant. Analyze the sentiment of each text entry below.
For each entry, assign exactly one of these labels: "Positive", "Neutral", or "Negative".

Column: "${header}"
Entries:
${rowsText}

Return a JSON array of objects with "index" (1-based row number) and "sentiment" (one of "Positive", "Neutral", "Negative").
The array must have exactly ${values.length} elements, one for each entry in order.

Example output for 3 entries:
[{"index":1,"sentiment":"Positive"},{"index":2,"sentiment":"Neutral"},{"index":3,"sentiment":"Negative"}]`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    if (!text) {
      return NextResponse.json(
        { error: 'Gemini returned an empty response' },
        { status: 502 }
      );
    }

    let parsed: SentimentResult[];
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return NextResponse.json(
          { error: 'Could not parse Gemini response as JSON' },
          { status: 502 }
        );
      }
      parsed = JSON.parse(jsonMatch[0]);
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: 'Gemini response was not an array' },
        { status: 502 }
      );
    }

    const sentiments = new Array<string>(values.length).fill('Neutral');
    for (const item of parsed) {
      const idx = item.index - 1;
      if (idx >= 0 && idx < values.length) {
        sentiments[idx] = item.sentiment;
      }
    }

    return NextResponse.json({ values: sentiments });
  } catch (err) {
    console.error('Sentiment analysis error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
