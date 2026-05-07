/**
 * Attendance Regularization Dialog Component
 * Modal dialog for initiating attendance regularization between dates
 */

import React, { useState } from "react";
import { post } from "../services/api";
import {
  validateDateRange,
  formatRegularizationPayload,
  processRegularizationResponse,
} from "../utils/attendanceRegularization";
import "./AttendanceRegularizationDialog.css";

export default function AttendanceRegularizationDialog({
  isOpen,
  onClose,
  employeeId,
  onSuccess,
  onError,
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const handleStartDateChange = (e) => {
    setStartDate(e.target.value);
    setError(null);
  };

  const handleEndDateChange = (e) => {
    setEndDate(e.target.value);
    setError(null);
  };

  const handlePreview = async () => {
    try {
      setError(null);
      setSuccessMessage(null);

      // Validate dates
      const validation = validateDateRange(startDate, endDate);
      if (!validation.isValid) {
        setError(validation.error);
        return;
      }

      setLoading(true);

      const payload = {
        employee_id: employeeId,
        start_date: startDate,
        end_date: endDate,
        action: "preview",
      };

      const response = await post("attendance/preview-punches", payload);
      const processedResponse = processRegularizationResponse(response);

      if (processedResponse.success) {
        setPreviewData(processedResponse.data);
        setShowPreview(true);
        setSuccessMessage(processedResponse.message);
      } else {
        setError(processedResponse.message);
      }
    } catch (err) {
      setError(err.message || "Failed to preview regularization");
      onError && onError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegularize = async () => {
    try {
      setError(null);
      setSuccessMessage(null);

      // Validate dates
      const validation = validateDateRange(startDate, endDate);
      if (!validation.isValid) {
        setError(validation.error);
        return;
      }

      setLoading(true);

      const payload = formatRegularizationPayload(
        [],
        employeeId,
        startDate,
        endDate,
      );

      const response = await post("attendance/regularize", payload);
      const processedResponse = processRegularizationResponse(response);

      if (processedResponse.success) {
        setSuccessMessage(
          `✓ ${processedResponse.message}\n${processedResponse.data?.synthetic_punches_created || 0} synthetic punches created`,
        );
        setShowPreview(false);

        // Clear form after success
        setTimeout(() => {
          setStartDate("");
          setEndDate("");
          setSuccessMessage(null);
          onSuccess && onSuccess(processedResponse.data);
        }, 2000);
      } else {
        setError(processedResponse.message);
      }
    } catch (err) {
      setError(err.message || "Failed to regularize attendance");
      onError && onError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStartDate("");
    setEndDate("");
    setError(null);
    setSuccessMessage(null);
    setShowPreview(false);
    setPreviewData(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="regularization-modal-overlay">
      <div className="regularization-modal">
        <div className="modal-header">
          <h2>Attendance Regularization</h2>
          <button
            className="modal-close-btn"
            onClick={handleClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="alert alert-danger">{error}</div>}
          {successMessage && (
            <div
              className="alert alert-success"
              style={{ whiteSpace: "pre-wrap" }}
            >
              {successMessage}
            </div>
          )}

          {!showPreview ? (
            <div className="form-group">
              <label htmlFor="employee-id">Employee ID</label>
              <input
                id="employee-id"
                type="text"
                className="form-control"
                value={employeeId}
                disabled
              />

              <label htmlFor="start-date" style={{ marginTop: "15px" }}>
                Start Date <span className="required">*</span>
              </label>
              <input
                id="start-date"
                type="date"
                className="form-control"
                value={startDate}
                onChange={handleStartDateChange}
                disabled={loading}
              />

              <label htmlFor="end-date" style={{ marginTop: "15px" }}>
                End Date <span className="required">*</span>
              </label>
              <input
                id="end-date"
                type="date"
                className="form-control"
                value={endDate}
                onChange={handleEndDateChange}
                disabled={loading}
              />

              <div className="form-helper-text">
                Select the date range for attendance regularization. Consecutive
                shift work will be automatically detected and regularized.
              </div>
            </div>
          ) : (
            <div className="preview-section">
              <h4>Preview</h4>
              <p>
                <strong>Date Range:</strong> {startDate} to {endDate}
              </p>
              {previewData?.synthetic_punches_created && (
                <p className="highlight-success">
                  ✓ {previewData.synthetic_punches_created} synthetic punches
                  will be created
                </p>
              )}
              {previewData?.next_shift_duration_hours && (
                <p>
                  <strong>Next Shift Duration:</strong>{" "}
                  {previewData.next_shift_duration_hours.toFixed(2)} hours
                </p>
              )}
              {previewData?.data?.synthetic_punches && (
                <div className="punches-table">
                  <h5>Synthetic Punches</h5>
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Time</th>
                        <th>Shift</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.data.synthetic_punches.map((punch, idx) => (
                        <tr key={idx}>
                          <td>
                            <span
                              className={`badge badge-${punch.type.toLowerCase()}`}
                            >
                              {punch.type}
                            </span>
                          </td>
                          <td>{new Date(punch.punch_time).toLocaleString()}</td>
                          <td>{punch.shift_name || punch.shift_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </button>

          {!showPreview ? (
            <>
              <button
                className="btn btn-primary"
                onClick={handlePreview}
                disabled={loading || !startDate || !endDate}
              >
                {loading ? "Loading..." : "Preview"}
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setShowPreview(false)}
                disabled={loading}
              >
                Back
              </button>
              <button
                className="btn btn-success"
                onClick={handleRegularize}
                disabled={loading}
              >
                {loading ? "Processing..." : "Confirm & Regularize"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
