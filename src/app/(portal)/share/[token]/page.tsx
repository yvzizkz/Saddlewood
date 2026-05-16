interface SharePageProps {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div className="max-w-lg w-full text-center">
        <h1
          className="text-2xl mb-4"
          style={{
            fontFamily: "var(--font-fraunces)",
            color: "var(--color-charcoal)",
          }}
        >
          Estimate Review
        </h1>
        <p style={{ color: "var(--color-charcoal)", opacity: 0.7 }}>
          This shared estimate link ({token}) will be available soon.
        </p>
      </div>
    </div>
  );
}
