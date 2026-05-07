/**
 * Attendance Regularization Utility
 * Handles multi-shift attendance logic for employees working consecutive shifts
 */

/**
 * Calculate working hours between two times
 * @param {Date} startTime - Check-in time
 * @param {Date} endTime - Check-out time
 * @returns {number} Working hours
 */
export const calculateWorkingHours = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  const diffMs = new Date(endTime) - new Date(startTime);
  return diffMs / (1000 * 60 * 60); // Convert milliseconds to hours
};

/**
 * Check if punch falls within shift window
 * @param {Date} punchTime - Punch time to check
 * @param {Object} shift - Shift object with start_time, end_time, begin_check_in_before_shift_start_time, allow_check_out_after_shift_end_time
 * @returns {boolean}
 */
export const isPunchInShiftWindow = (punchTime, shift) => {
  if (!shift) return false;

  const punch = new Date(punchTime);
  const shiftStart = new Date(shift.start_time);
  const shiftEnd = new Date(shift.end_time);

  // Handle night shifts (end_time < start_time means it spans midnight)
  let isNightShift = shiftEnd < shiftStart;

  const beforeBuffer = shift.begin_check_in_before_shift_start_time || 0;
  const afterBuffer = shift.allow_check_out_after_shift_end_time || 0;

  const windowStart = new Date(shiftStart.getTime() - beforeBuffer * 60 * 1000);
  const windowEnd = new Date(shiftEnd.getTime() + afterBuffer * 60 * 1000);

  if (!isNightShift) {
    return punch >= windowStart && punch <= windowEnd;
  } else {
    // For night shifts, check if punch is after shift start OR before shift end
    return (
      punch >= new Date(shiftStart.getTime() - beforeBuffer * 60 * 1000) ||
      punch <= new Date(shiftEnd.getTime() + afterBuffer * 60 * 1000)
    );
  }
};

/**
 * Detect consecutive shift work
 * @param {Date} firstPunch - First punch (check-in)
 * @param {Date} lastPunch - Last punch (check-out)
 * @param {Object} currentShift - Current shift object
 * @param {Object} nextShift - Next shift object
 * @param {number} threshold - Working hours threshold for half day (e.g., 4 hours)
 * @returns {Object} {shouldCreateSyntheticPunches: boolean, nextShiftDuration: number}
 */
export const detectConsecutiveShiftWork = (
  firstPunch,
  lastPunch,
  currentShift,
  nextShift,
  threshold = 4,
) => {
  if (!firstPunch || !lastPunch || !currentShift || !nextShift) {
    return { shouldCreateSyntheticPunches: false, nextShiftDuration: 0 };
  }

  const currentShiftEnd = new Date(currentShift.end_time);
  const nextShiftStart = new Date(nextShift.start_time);
  const nextShiftEnd = new Date(nextShift.end_time);

  const lastPunchDate = new Date(lastPunch);
  const afterBuffer = nextShift.allow_check_out_after_shift_end_time || 0;
  const nextShiftWindowEnd = new Date(
    nextShiftEnd.getTime() + afterBuffer * 60 * 1000,
  );

  // Check if last punch is after current shift end (indicating work into next shift)
  if (lastPunchDate > currentShiftEnd) {
    // Check if work substantially extends into next shift
    const workInNextShift = calculateWorkingHours(
      nextShiftStart,
      lastPunchDate,
    );

    if (workInNextShift >= threshold) {
      return {
        shouldCreateSyntheticPunches: true,
        nextShiftDuration: workInNextShift,
      };
    }
  }

  return { shouldCreateSyntheticPunches: false, nextShiftDuration: 0 };
};

/**
 * Generate synthetic boundary punches for consecutive shift work
 * @param {Date} firstPunch - Original check-in
 * @param {Date} lastPunch - Original check-out
 * @param {Object} currentShift - Current shift object
 * @param {Object} nextShift - Next shift object
 * @returns {Array} Array of synthetic punch objects {punch_time, shift_id, type}
 */
export const generateSyntheticPunches = (
  firstPunch,
  lastPunch,
  currentShift,
  nextShift,
) => {
  const syntheticPunches = [];

  const currentShiftEnd = new Date(currentShift.end_time);
  const nextShiftStart = new Date(nextShift.start_time);

  // Synthetic OUT for current shift (at shift end time)
  syntheticPunches.push({
    punch_time: currentShiftEnd.toISOString(),
    shift_id: currentShift.id,
    type: "OUT",
    is_synthetic: true,
  });

  // Synthetic IN for next shift (at shift start time)
  syntheticPunches.push({
    punch_time: nextShiftStart.toISOString(),
    shift_id: nextShift.id,
    type: "IN",
    is_synthetic: true,
  });

  return syntheticPunches;
};

/**
 * Validate date range for regularization
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Object} {isValid: boolean, error: string|null}
 */
export const validateDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return { isValid: false, error: "Both dates are required" };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    return { isValid: false, error: "Start date must be before end date" };
  }

  const maxDays = 90;
  const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

  if (daysDiff > maxDays) {
    return {
      isValid: false,
      error: `Date range cannot exceed ${maxDays} days`,
    };
  }

  return { isValid: true, error: null };
};

/**
 * Format punch data for API submission
 * @param {Array} punches - Array of punch objects
 * @param {string} employeeId - Employee ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Object} Formatted payload for API
 */
export const formatRegularizationPayload = (
  punches,
  employeeId,
  startDate,
  endDate,
) => {
  return {
    employee_id: employeeId,
    start_date: startDate,
    end_date: endDate,
    punches: punches || [],
    regularization_type: "consecutive_shift",
    created_at: new Date().toISOString(),
  };
};

/**
 * Process regularization response
 * @param {Object} response - API response
 * @returns {Object} {success: boolean, message: string, data: Object}
 */
export const processRegularizationResponse = (response) => {
  if (!response) {
    return { success: false, message: "No response received", data: null };
  }

  if (response.error) {
    return {
      success: false,
      message: response.error || "Regularization failed",
      data: null,
    };
  }

  if (response.success || response.status === "success") {
    return {
      success: true,
      message: response.message || "Attendance regularized successfully",
      data: response.data || response,
    };
  }

  return { success: false, message: "Unknown error occurred", data: null };
};
