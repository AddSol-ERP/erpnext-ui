import { useEffect, useState } from "react";
import { get } from "../../../services/api";

export default function WarehouseSelector({
  mode,
  fromWarehouse,
  setFromWarehouse,
  toWarehouse,
  setToWarehouse,
}) {
  const [wareHouseList, setWareHouseList] = useState([]);
  useEffect(() => {
    getWareHouses();
  }, []);

  const getWareHouses = async () => {
    let res = await get(`resource/Warehouse`);
    setWareHouseList(res?.data);
  };

  return (
    <>
      <div className="col-12 col-md-6">
        <label className="form-label">From Warehouse</label>
        <select
          className="form-select"
          value={fromWarehouse}
          onChange={(e) => setFromWarehouse(e.target.value)}
        >
          <option value="">Select From Warehouse</option>
          {wareHouseList.map((warehouse, warehouseIdx) => {
            return (
              <option key={`from-${warehouseIdx}`} value={warehouse.name}>
                {warehouse.name}
              </option>
            );
          })}
        </select>
      </div>

      <div className="col-12 col-md-6">
        <label className="form-label">To Warehouse</label>
        <select
          className="form-select"
          value={toWarehouse}
          onChange={(e) => setToWarehouse(e.target.value)}
        >
          <option value="">Select To Warehouse</option>
          {wareHouseList.map((warehouse, warehouseIdx) => {
            return (
              <option key={`to-${warehouseIdx}`} value={warehouse.name}>
                {warehouse.name}
              </option>
            );
          })}
        </select>
      </div>
    </>
  );
}
