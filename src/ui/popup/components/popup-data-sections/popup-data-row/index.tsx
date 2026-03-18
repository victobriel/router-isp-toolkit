interface PopupDataRowProps {
  label: string;
  value: string | React.ReactNode;
}

export const PopupDataRow = ({ label, value }: PopupDataRowProps) => {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right truncate max-w-[55%]">{value}</span>
    </div>
  );
};
