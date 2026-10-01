import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { get } from "../../../services/api";
import FormSelect from "../../FormSelect";
import { FormField } from "../../FormField";

export default function WarehouseSelector({
  fromWarehouse,
  setFromWarehouse,
  toWarehouse,
  setToWarehouse,
}) {
  const { t } = useTranslation();
  const [wareHouseList, setWareHouseList] = useState([]);

  const getWareHouses = async () => {
    let res = await get(`resource/Warehouse`);
    setWareHouseList(res?.data);
  };

  useEffect(() => {
    // getWareHouses only setStates after the awaited API response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    getWareHouses();
  }, []);

  const warehouseOptions = (wareHouseList || []).map((w) => ({
    value: w.name,
    label: w.name,
  }));

  return (
    <>
      <FormField
        label={t("store.entry.fromWarehouse")}
        name="from_warehouse"
        htmlFor="stock-entry-from-warehouse"
      >
        <FormSelect
          id="stock-entry-from-warehouse"
          value={fromWarehouse}
          onChange={setFromWarehouse}
          placeholder={t("store.entry.selectFromWarehouse")}
          options={warehouseOptions}
        />
      </FormField>

      <FormField
        label={t("store.entry.toWarehouse")}
        name="to_warehouse"
        htmlFor="stock-entry-to-warehouse"
      >
        <FormSelect
          id="stock-entry-to-warehouse"
          value={toWarehouse}
          onChange={setToWarehouse}
          placeholder={t("store.entry.selectToWarehouse")}
          options={warehouseOptions}
        />
      </FormField>
    </>
  );
}
