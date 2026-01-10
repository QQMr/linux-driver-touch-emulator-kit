import { Frame } from '../types';

const MAX_TOUCH_POINTS = 10;

export function generateCsvContent(frames: Frame[]): string {
  if (frames.length === 0) return '';

  const firstFrame = frames[0].matrix;
  const rows = firstFrame.length;
  const cols = firstFrame[0].length;

  // Build Header
  const headers = ['Timestamp', 'Message'];

  // Matrix Headers
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      headers.push(`R${r}C${c}`);
    }
  }

  // Touch Point Headers
  for (let i = 1; i <= MAX_TOUCH_POINTS; i++) {
    headers.push(`TP${i}_X`, `TP${i}_Y`);
  }

  let csvContent = headers.join(',') + '\n';

  frames.forEach(frame => {
    const row: (number | string)[] = [frame.ts, `"${frame.message || ''}"`];

    // Matrix Data
    frame.matrix.forEach(matrixRow => {
      matrixRow.forEach(val => {
        row.push(val);
      });
    });

    // Touch Point Data
    for (let i = 0; i < MAX_TOUCH_POINTS; i++) {
      const pt = frame.touchPoints[i];
      if (pt) {
        row.push(pt.x.toFixed(4));
        row.push(pt.y.toFixed(4));
      } else {
        row.push('', '');
      }
    }

    csvContent += row.join(',') + '\n';
  });

  return csvContent;
}

export function generateJsonContent(frames: Frame[], isSnapshot: boolean): string {
  const exportData = {
    fileType: 'LiveMatrixRecording',
    exportMessage: isSnapshot
      ? 'Snapshot data saved successfully'
      : 'Recording data saved successfully',
    timestamp: new Date().toISOString(),
    recordCount: frames.length,
    frames: frames
  };

  return JSON.stringify(exportData, null, 2);
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generateFilename(
  type: 'csv' | 'json',
  isSnapshot: boolean,
  startTime?: number,
  endTime?: number
): string {
  const ext = type;

  if (isSnapshot) {
    return `matrix_snapshot_${Date.now()}.${ext}`;
  }

  const start = startTime || Date.now();
  const end = endTime || Date.now();
  return `matrix_recording_${start}_to_${end}.${ext}`;
}
