import type { ZoneChip } from "../describe";

export function PayLink({ payment, block }: { payment: NonNullable<ZoneChip["payment"]>; block?: boolean }) {
  return (
    <a
      className={`app__pay${block ? " app__pay--block" : ""}`}
      href={payment.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="app__pay-label">Pay</span>
      <span className="app__pay-price">{payment.priceLabel}</span>
    </a>
  );
}
