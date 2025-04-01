export default function Footer() {
  return (
    <footer className="bg-zinc-900 text-white py-4 mt-auto">
      <div className="container mx-auto px-4 text-center text-sm">
        <p>&copy; {new Date().getFullYear()} ClassParticipate. All rights reserved.</p>
      </div>
    </footer>
  );
}
