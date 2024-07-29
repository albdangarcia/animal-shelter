import {
  IdentificationIcon,
  AtSymbolIcon,
  PhoneIcon,
  ChatBubbleBottomCenterTextIcon,
} from "@heroicons/react/24/outline";

// contact us page
export default function Page() {
  return (
    <>
      <div className="">
        <div className="mx-auto max-w-[40rem]">

          <h1 className="text-2xl">Contact Us</h1>
          <p className="text-gray-500 text-sm">
            We will contact you as soon as possible
          </p>

          <div className="pt-6 grid grid-cols-6 gap-x-6 gap-y-8">
            {/* user name label */}
            <div className="col-span-3">
              <label htmlFor="name" className="mb-2 block text-sm font-medium">
                Name
              </label>
              <div className="relative mt-2 rounded-md">
                <div className="relative">
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="off"
                    placeholder="Enter name"
                    className="peer block w-full rounded-md border border-gray-200 py-2 pl-10 text-sm outline-2 placeholder:text-gray-500"
                  />
                  <IdentificationIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                </div>
              </div>
            </div>

            {/* phone number label */}
            <div className="col-span-3">
              <label htmlFor="phone" className="mb-2 block text-sm font-medium">
                Phone Number
              </label>
              <div className="relative mt-2 rounded-md">
                <div className="relative">
                  <input
                    id="phone"
                    name="phone"
                    type="text"
                    autoComplete="off"
                    placeholder="Enter phone number"
                    className="peer block w-full rounded-md border border-gray-200 py-2 pl-10 text-sm outline-2 placeholder:text-gray-500"
                  />
                  <PhoneIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                </div>
              </div>
            </div>

            {/* email label */}
            <div className="col-span-full">
              <label htmlFor="email" className="mb-2 block text-sm font-medium">
                E-mail
              </label>
              <div className="relative mt-2 rounded-md">
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="off"
                    placeholder="Enter e-mail"
                    className="peer block w-full rounded-md border border-gray-200 py-2 pl-10 text-sm outline-2 placeholder:text-gray-500"
                  />
                  <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                </div>
              </div>
            </div>

            {/* message label */}
            <div className="col-span-full">
              <label
                htmlFor="message"
                className="mb-2 block text-sm font-medium"
              >
                Message
              </label>
              <div className="relative mt-2 rounded-md">
                <div className="relative">
                  <textarea
                    id="message"
                    name="message"
                    rows={3}
                    autoComplete="off"
                    placeholder="Enter message"
                    className="peer block w-full rounded-md border border-gray-200 py-2 pl-10 text-sm outline-2 placeholder:text-gray-500"
                  />
                  <ChatBubbleBottomCenterTextIcon className="pointer-events-none absolute left-3 top-5 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
                </div>
              </div>
            </div>
            {/* submit button */}
            <div className="col-start-1">
              <button
                type="submit"
                className="bg-blue-500 text-sm text-white py-2 w-full rounded-md"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
