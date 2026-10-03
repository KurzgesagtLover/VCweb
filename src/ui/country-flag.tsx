import Image from "next/image";

export function CountryFlag({ value, name }: { value: string | null | undefined; name: string }) {
  const flag = value || "⚑";
  if (flag.startsWith("/")) {
    return (
      <Image
        className="country-flag-image"
        src={flag}
        alt={`${name} 국기`}
        width={180}
        height={120}
        unoptimized
      />
    );
  }
  return <>{flag}</>;
}
