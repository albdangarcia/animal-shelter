import { FacebookIcon, InstagramIcon, TwitterIcon } from "@/app/ui/social-media-icons";
import Link from "next/link";

export default function Footer() {
    return (
        <footer className="mx-auto w-full max-w-[76rem]">
        {/* footer with a border on the top, the location of the shelter on the left and on the right social network icons */}
        <div className="border-t border-gray-300 py-6 flex justify-between items-center mt-10">
          <div className="text-sm text-slate-500">© 2024 PetAdopt</div>
          <div className="flex gap-5">
            <Link href="#" className="w-5 h-5 fill-slate-400">
              <FacebookIcon />
            </Link>
            <Link href="#" className="w-5 h-5 fill-slate-400">
              <TwitterIcon />
            </Link>
            <Link href="#" className="w-5 h-5 fill-slate-400">
              <InstagramIcon />
            </Link>
          </div>
        </div>
      </footer>
    );
}