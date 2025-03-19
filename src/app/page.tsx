import Link from "next/link";

export default function Home() {
  return (
    <>
      <div>
        <Link
          href="/login"
          className="text-blue-500 h-10 rounded-md text-center px-5"
        >
          Login
        </Link>
      </div>
    </>
  );
}
