export default function ListView({ data = [], renderItem }) {
  return (
    <div className="list-container">
      {data.length === 0 ? (
        <div className="list-empty">No data found</div>
      ) : (
        data.map((item, idx) => (
          <div key={idx} className="list-item">
            {renderItem(item, idx)}
          </div>
        ))
      )}
    </div>
  );
}
