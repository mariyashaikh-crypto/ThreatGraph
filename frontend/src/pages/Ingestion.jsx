import { useRef, useState } from 'react';
import { Icon } from '../components/Icons';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  InfoCallout,
  PageIntro,
} from '../components/ui';
import { api } from '../api';
import {
  downloadCsvTemplate,
  EXPECTED_EVENT_FIELDS,
  EXPECTED_LOGIN_FIELDS,
  parseCsv,
} from '../utils/csv';
import { formatNumber } from '../utils/format';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Ingestion() {
  const inputRef = useRef(null);

  const [dragging, setDragging] = useState(false);
  const [fileInfo, setFileInfo] = useState(null);
  const [validation, setValidation] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  async function handleFile(file) {
    if (!file) return;

    setFileInfo(null);
    setValidation(null);
    setUploadResult(null);

    const errors = [];

    if (!file.name.toLowerCase().endsWith('.csv')) {
      errors.push('The selected file must use the .csv extension.');
    }

    if (file.size === 0) {
      errors.push('The selected file is empty.');
    }

    if (file.size > MAX_FILE_SIZE) {
      errors.push('The selected file is larger than the 5 MB upload limit.');
    }

    if (errors.length) {
      setValidation({ type: 'error', messages: errors });
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCsv(text);

      if (!parsed.headers.length) {
        setValidation({
          type: 'error',
          messages: ['No CSV header row could be detected in this file.'],
        });
        return;
      }

      if (!parsed.rows.length) {
        setValidation({
          type: 'error',
          messages: ['The CSV contains a header row but no data records.'],
        });
        return;
      }

      setFileInfo({
        file,
        name: file.name,
        size: file.size,
        headers: parsed.headers,
        rows: parsed.rows,
        missingFields: parsed.missingFields,
      });

      setValidation({
        type: 'success',
        messages: [
          `${formatNumber(parsed.rows.length)} record${
            parsed.rows.length === 1 ? '' : 's'
          } parsed successfully. Ready to upload.`,
        ],
      });
    } catch (error) {
      setValidation({
        type: 'error',
        messages: [`The file could not be read: ${error.message}`],
      });
    }
  }

  async function handleUpload() {
    if (!fileInfo?.file || uploading) return;

    setUploading(true);
    setUploadResult(null);
    setValidation(null);

    try {
      const result = await api.uploadCsv(fileInfo.file);

      setUploadResult(result);

      setValidation({
        type: result.failed_rows > 0 ? 'error' : 'success',
        messages: [
          result.message || 'CSV processing completed.',
          `${result.successful_rows} records uploaded successfully.`,
          `${result.failed_rows} records failed.`,
        ],
      });
    } catch (error) {
      setValidation({
        type: 'error',
        messages: [error.message || 'CSV upload failed. Please try again.'],
      });
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(event) {
    const file = event.target.files?.[0];
    handleFile(file);
    event.target.value = '';
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files?.[0];
    handleFile(file);
  }

  function clearFile() {
    setFileInfo(null);
    setValidation(null);
    setUploadResult(null);

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  return (
    <div className="page-stack">
      <PageIntro
        description="Upload event data to the backend for real-time risk analysis."
        eyebrow="Data preparation"
        title="Event Ingestion"
        actions={
          <Button icon="download" onClick={downloadCsvTemplate} variant="secondary">
            Download CSV template
          </Button>
        }
      />

      <InfoCallout
        icon="info"
        title="CSV upload is connected to the backend"
        tone="info"
      >
        <p>
          Select a CSV file to preview its contents, then click{' '}
          <strong>Upload & Analyze</strong> to send it to the backend. The
          backend processes the records and calculates their risk scores.
        </p>
      </InfoCallout>

      <div className="grid grid--ingest">
        <Card>
          <CardHeader
            icon="upload"
            subtitle="Drag a CSV file here or use Browse Files."
            title="CSV File Upload"
          />

          <div
            className={`dropzone ${dragging ? 'is-dragging' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget === event.target) {
                setDragging(false);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDrop={handleDrop}
          >
            <span className="dropzone__icon">
              <Icon name="file" size={30} />
            </span>

            <h3>Drop a CSV file to upload</h3>

            <p>
              Maximum file size: 5 MB. Supported extension:{' '}
              <span className="mono">.csv</span>
            </p>

            <div className="dropzone__actions">
              <Button
                icon="upload"
                onClick={() => inputRef.current?.click()}
                variant="primary"
              >
                Browse Files
              </Button>

              <input
                accept=".csv,text/csv"
                className="visually-hidden"
                onChange={handleInputChange}
                ref={inputRef}
                type="file"
              />

              {fileInfo ? (
                <Button icon="close" onClick={clearFile} variant="ghost">
                  Clear file
                </Button>
              ) : null}
            </div>
          </div>

          {validation ? (
            <div
              className={`inline-alert inline-alert--${validation.type}`}
              role={validation.type === 'error' ? 'alert' : 'status'}
            >
              <Icon
                name={validation.type === 'error' ? 'xCircle' : 'checkCircle'}
                size={18}
              />

              <div>
                {validation.messages.map((message, index) => (
                  <p key={`${message}-${index}`}>{message}</p>
                ))}
              </div>
            </div>
          ) : null}

          {fileInfo ? (
            <div className="file-summary">
              <div className="file-summary__main">
                <span className="file-summary__icon">
                  <Icon name="file" size={19} />
                </span>

                <div>
                  <strong>{fileInfo.name}</strong>
                  <span>
                    {formatFileSize(fileInfo.size)} ·{' '}
                    {formatNumber(fileInfo.rows.length)} records ·{' '}
                    {fileInfo.headers.length} columns
                  </span>
                </div>
              </div>

              <div className="file-summary__badges">
                <Badge tone="info">Preview ready</Badge>
                <Badge tone="pending">
                  {uploadResult ? 'Upload completed' : 'Awaiting upload'}
                </Badge>
              </div>

              <Button
                className="button-block"
                icon="upload"
                onClick={handleUpload}
                disabled={uploading}
                variant="primary"
              >
                {uploading ? 'Uploading and analyzing...' : 'Upload & Analyze'}
              </Button>
            </div>
          ) : null}

          {fileInfo?.missingFields?.length ? (
            <p className="section-note">
              These recognized fields were not found in the CSV header:{' '}
              <span className="mono">
                {fileInfo.missingFields.join(', ')}
              </span>
              . The backend will validate the required columns during upload.
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            icon="scan"
            subtitle="Fields supported by the existing backend."
            title="Supported Fields"
          />

          <div className="field-group">
            <h3>Event analysis</h3>
            <p>Used by POST /api/analyze and POST /api/simulate.</p>

            <div className="field-chips">
              {EXPECTED_EVENT_FIELDS.map((field) => (
                <code key={field}>{field}</code>
              ))}
            </div>
          </div>

          <div className="field-group">
            <h3>Login events</h3>
            <p>Used by POST /api/login-event.</p>

            <div className="field-chips">
              {EXPECTED_LOGIN_FIELDS.map((field) => (
                <code key={field}>{field}</code>
              ))}
            </div>
          </div>

          <div className="field-group">
            <h3>Upload validation rules</h3>
            <ul className="compact-list">
              <li>File extension must be .csv.</li>
              <li>File must not be empty.</li>
              <li>Maximum file size is 5 MB.</li>
              <li>Header row and data records are required.</li>
              <li>Backend validates required event columns.</li>
            </ul>
          </div>

          <Button
            className="button-block"
            icon="download"
            onClick={downloadCsvTemplate}
            variant="secondary"
          >
            Download example template
          </Button>
        </Card>
      </div>

      {uploadResult ? (
        <Card>
          <CardHeader
            icon="activity"
            subtitle="Results returned by the backend."
            title="CSV Analysis Results"
          />

          <div className="file-summary__badges">
            <Badge tone="info">
              Total: {uploadResult.total_rows}
            </Badge>
            <Badge tone="success">
              Successful: {uploadResult.successful_rows}
            </Badge>
            <Badge tone={uploadResult.failed_rows > 0 ? 'danger' : 'neutral'}>
              Failed: {uploadResult.failed_rows}
            </Badge>
          </div>

          {uploadResult.events?.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>IP Address</th>
                    <th>Risk Score</th>
                    <th>Risk Level</th>
                  </tr>
                </thead>

                <tbody>
                  {uploadResult.events.map((event) => (
                    <tr key={event.id}>
                      <td>{event.user_id}</td>
                      <td>{event.ip_address}</td>
                      <td>{event.risk_score}</td>
                      <td>{event.risk_level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {uploadResult.errors?.length ? (
            <div className="section-note">
              <strong>Upload errors:</strong>
              {uploadResult.errors.map((error, index) => (
                <p key={index}>
                  Row {error.row}: {error.error}
                </p>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card padded={false}>
        <div className="card-padded-header">
          <CardHeader
            actions={
              fileInfo ? (
                <Badge tone="info">
                  Showing first{' '}
                  {formatNumber(Math.min(fileInfo.rows.length, 100))} of{' '}
                  {formatNumber(fileInfo.rows.length)}
                </Badge>
              ) : null
            }
            icon="activity"
            subtitle="Preview of the selected CSV file."
            title="Event Preview"
          />
        </div>

        {fileInfo ? (
          <div className="table-wrap table-wrap--tall">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="row-number">#</th>
                  {fileInfo.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {fileInfo.rows.slice(0, 100).map((row, index) => (
                  <tr key={`row-${index}`}>
                    <td className="row-number">{index + 1}</td>

                    {fileInfo.headers.map((header) => (
                      <td key={`${header}-${index}`}>
                        {row[header] === '' ? (
                          <span className="text-dim">—</span>
                        ) : (
                          row[header]
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card-padded">
            <EmptyState
              description="Select a CSV file to preview its columns and records here."
              icon="file"
              title="No file selected"
            />
          </div>
        )}
      </Card>
    </div>
  );
}