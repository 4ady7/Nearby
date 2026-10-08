export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading your space">
      <div className="skeleton title" />
      <div className="skeleton card" />
      <div className="skeleton card" />
    </div>
  );
}
