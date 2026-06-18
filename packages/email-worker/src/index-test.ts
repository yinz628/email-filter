/**
 * Cloudflare Email Worker - Subject diagnostics worker
 *
 * This worker is intentionally isolated from the production filter path.
 * It is used to capture email header diagnostics for samples where
 * message.headers.get('subject') does not expose the real subject.
 */

interface Env {
  WORKER_NAME: string;
  DEBUG_LOGGING: string;
}

const MAX_HEADER_BYTES = 64 * 1024;

interface SubjectDiagnostics {
  workerName: string;
  timestamp: number;
  from: string;
  to: string;
  headerSubject: string | null;
  messageId: string | null;
  contentType: string | null;
  contentTransferEncoding: string | null;
  hasRawSubject: boolean;
  rawSubjectLines: string[];
  allSubjectLines: string[];
  xOriginalSubject: string[];
  headerPreview: string;
}

function logLine(message: string): void {
  console.log(message);
}

async function readRawHeaderText(message: ForwardableEmailMessage): Promise<string> {
  const reader = message.raw.getReader();
  const decoder = new TextDecoder('utf-8');
  let headerText = '';

  try {
    while (headerText.indexOf('\r\n\r\n') === -1 && headerText.indexOf('\n\n') === -1) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      headerText += decoder.decode(value, { stream: true });
      if (headerText.length > MAX_HEADER_BYTES) {
        break;
      }
    }
    headerText += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  const separatorIndex = headerText.indexOf('\r\n\r\n') !== -1
    ? headerText.indexOf('\r\n\r\n')
    : headerText.indexOf('\n\n');
  return separatorIndex === -1 ? headerText : headerText.slice(0, separatorIndex);
}

function collectHeaderBlockLines(headersOnly: string, headerName: string): string[] {
  const normalized = headersOnly.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!new RegExp(`^${headerName}:`, 'i').test(lines[i])) {
      continue;
    }

    let block = lines[i];
    let j = i + 1;
    while (j < lines.length && /^[ \t]/.test(lines[j])) {
      block += `\n${lines[j]}`;
      j++;
    }

    blocks.push(block);
    i = j - 1;
  }

  return blocks;
}

function buildDiagnostics(
  message: ForwardableEmailMessage,
  env: Env,
  headersOnly: string
): SubjectDiagnostics {
  const headerPreview = headersOnly.length > 4000
    ? `${headersOnly.slice(0, 4000)}\n...[truncated]`
    : headersOnly;

  return {
    workerName: env.WORKER_NAME,
    timestamp: Date.now(),
    from: message.from,
    to: message.to,
    headerSubject: message.headers.get('subject'),
    messageId: message.headers.get('message-id'),
    contentType: message.headers.get('content-type'),
    contentTransferEncoding: message.headers.get('content-transfer-encoding'),
    hasRawSubject: /^subject:/im.test(headersOnly),
    rawSubjectLines: collectHeaderBlockLines(headersOnly, 'subject'),
    allSubjectLines: collectHeaderBlockLines(headersOnly, 'subject'),
    xOriginalSubject: collectHeaderBlockLines(headersOnly, 'x-original-subject'),
    headerPreview,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(JSON.stringify({
        status: 'ok',
        workerName: env.WORKER_NAME,
        mode: 'subject-diagnostics',
        timestamp: Date.now(),
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const headersOnly = await readRawHeaderText(message);
    const diagnostics = buildDiagnostics(message, env, headersOnly);

    logLine(`[SUBJECT_DIAG_BEGIN] worker=${diagnostics.workerName} to=${diagnostics.to}`);
    logLine(`[SUBJECT_DIAG_SUMMARY] headerSubject=${diagnostics.headerSubject ?? 'null'} hasRawSubject=${String(diagnostics.hasRawSubject)} rawSubjectCount=${diagnostics.rawSubjectLines.length} messageId=${diagnostics.messageId ?? 'null'}`);
    logLine(`[SUBJECT_DIAG_FROM] ${diagnostics.from}`);
    logLine(`[SUBJECT_DIAG_TO] ${diagnostics.to}`);
    logLine(`[SUBJECT_DIAG_CONTENT_TYPE] ${diagnostics.contentType ?? 'null'}`);
    logLine(`[SUBJECT_DIAG_TRANSFER_ENCODING] ${diagnostics.contentTransferEncoding ?? 'null'}`);

    if (diagnostics.rawSubjectLines.length === 0) {
      logLine('[SUBJECT_DIAG_RAW_SUBJECT] none');
    } else {
      diagnostics.rawSubjectLines.forEach((line, index) => {
        logLine(`[SUBJECT_DIAG_RAW_SUBJECT_${index + 1}] ${line}`);
      });
    }

    if (diagnostics.xOriginalSubject.length === 0) {
      logLine('[SUBJECT_DIAG_X_ORIGINAL_SUBJECT] none');
    } else {
      diagnostics.xOriginalSubject.forEach((line, index) => {
        logLine(`[SUBJECT_DIAG_X_ORIGINAL_SUBJECT_${index + 1}] ${line}`);
      });
    }

    logLine(`[SUBJECT_DIAG_HEADER_PREVIEW_BEGIN] ${diagnostics.headerPreview.slice(0, 1200)}`);
    logLine('[SUBJECT_DIAG_JSON] ' + JSON.stringify(diagnostics));
    logLine('[SUBJECT_DIAG_END]');
  },
};
