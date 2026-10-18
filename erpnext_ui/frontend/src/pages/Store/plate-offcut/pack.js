/**
 * Indicative layout for the Plate Offcut canvas.
 *
 * WHAT THIS IS NOT: the cut plan. `cutting.check_offcut_fits` only asks whether
 * each offcut fits inside the plate *in either orientation*
 * (plates/cutting.py:183-190). The server never positions a piece, computes no
 * packing and does not care how the plate is divided -- it sums the weights and
 * derives the scrap that balances the remainder. So nothing here may be treated
 * as the layout a saw would follow; it exists so an operator can SEE the
 * relationship between the pieces and the plate they came from.
 *
 * WHAT THIS IS NOT EITHER: a weight calculation. Weight comes from an
 * admin-authored formula on the Item Group, evaluated by the server
 * (`plates/weight.py`). This file only places rectangles.
 *
 * Shelf packing, largest first, rotation allowed: fill a shelf left to right,
 * open a new shelf below when the next piece will not fit the remaining width.
 * Deliberately simple and deterministic -- the same input always draws the same
 * picture, so the canvas does not shuffle under the operator while they type.
 */

/**
 * @typedef {object} Piece
 * @property {string} id        - stable client key, echoed back on hover
 * @property {number} length_mm
 * @property {number} width_mm
 * @property {number} [count]   - pieces of this size; drawn one per unit
 */

/**
 * @typedef {object} Placed
 * @property {string} id
 * @property {number} x  - top-left, in millimetres from the plate's corner
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {boolean} rotated - drawn turned 90 degrees to fit the shelf
 * @property {number} index    - which unit of its row this is (for "x3" labels)
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Lay pieces out on a plate.
 *
 * @param {{plateLength: number, plateWidth: number, pieces: Piece[]}} input
 * @returns {{placed: Placed[], overflow: Placed[], usedArea: number, plateArea: number}}
 *   `overflow` holds pieces that do not fit even rotated. They are REPORTED,
 *   not silently dropped: the server refuses the save with its own message, and
 *   a piece that vanished from the canvas would just look like it was counted.
 */
export function packPieces({ plateLength, plateWidth, pieces = [] }) {
  const plateL = num(plateLength);
  const plateW = num(plateWidth);

  // Largest first, ties broken by the longer side then by id, so the result does
  // not depend on the order rows happen to be typed in.
  const units = [];
  pieces.forEach((piece) => {
    const l = num(piece.length_mm);
    const w = num(piece.width_mm);
    if (l <= 0 || w <= 0) return;
    const count = Math.max(1, Math.floor(num(piece.count) || 1));
    for (let i = 0; i < count; i += 1) {
      units.push({ id: piece.id, index: i, l, w, area: l * w });
    }
  });
  units.sort(
    (a, b) =>
      b.area - a.area ||
      Math.max(b.l, b.w) - Math.max(a.l, a.w) ||
      Math.min(b.l, b.w) - Math.min(a.l, a.w) ||
      String(a.id).localeCompare(String(b.id)),
  );

  const placed = [];
  const overflow = [];

  if (plateL <= 0 || plateW <= 0) {
    // No plate geometry yet -- nothing can be placed, and saying so is better
    // than drawing pieces at an arbitrary scale.
    units.forEach((u) => overflow.push(placedOne(u, 0, 0, u.l, u.w, false)));
    return { placed, overflow, usedArea: 0, plateArea: 0 };
  }

  // Shelves: each is a band down the plate with a height and a running x.
  const shelves = [];

  for (const unit of units) {
    let done = false;

    for (const shelf of shelves) {
      for (const rot of [false, true]) {
        const w = rot ? unit.w : unit.l;
        const h = rot ? unit.l : unit.w;
        if (h > shelf.height) continue; // would not clear the shelf above it
        if (shelf.x + w > plateL) continue; // would run past the plate edge
        placed.push(placedOne(unit, shelf.x, shelf.y, w, h, rot));
        shelf.x += w;
        done = true;
        break;
      }
      if (done) break;
    }
    if (done) continue;

    // No shelf took it: try opening a new one at the bottom.
    for (const rot of [false, true]) {
      const w = rot ? unit.w : unit.l;
      const h = rot ? unit.l : unit.w;
      if (w > plateL || h > plateW) continue;
      // Bottom-most shelf, i.e. the lowest free y.
      const y = shelves.length
        ? Math.max(...shelves.map((s) => s.y + s.height))
        : 0;
      if (y + h > plateW) continue;
      shelves.push({ y, height: h, x: w });
      placed.push(placedOne(unit, 0, y, w, h, rot));
      done = true;
      break;
    }
    if (done) continue;

    // Cannot be placed at all, in either orientation.
    const fitsEither =
      (unit.l <= plateL && unit.w <= plateW) ||
      (unit.l <= plateW && unit.w <= plateL);
    overflow.push({
      id: unit.id,
      index: unit.index,
      x: 0,
      y: 0,
      w: unit.l,
      h: unit.w,
      rotated: false,
      fitsAtAll: fitsEither,
    });
  }

  return {
    placed,
    overflow,
    usedArea: placed.reduce((sum, p) => sum + p.w * p.h, 0),
    plateArea: plateL * plateW,
  };
}

function placedOne(unit, x, y, w, h, rotated) {
  return {
    id: unit.id,
    index: unit.index,
    x,
    y,
    w,
    h,
    rotated,
    fitsAtAll: true,
  };
}

/**
 * A human label for one drawn piece, short enough for a rectangle.
 *
 * @param {Placed} piece
 * @param {Map<string, number>} countsById - total units per row, to render "x3"
 * @returns {string}
 */
export function pieceLabel(piece, countsById) {
  const total = countsById?.get(piece.id) ?? 1;
  const size = `${Math.round(piece.w)}x${Math.round(piece.h)}`;
  return total > 1 ? `${size} x${total}` : size;
}
