export default function Page() {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div><h1 className="text-3xl text-center p-4 text-gray-400">Who we are.</h1></div>
        <div>
          <h1 className="text-center text-3xl py-3 text-gray-600">About Us</h1>
          <p className="mt-4 text-base text-slate-700 text-center sm:text-left">
            Welcome to PetAdopt, where compassion meets purpose. Our mission is
            simple yet profound: to provide a safe haven for animals in need,
            offering them refuge, care, and a second chance at a loving home. With
            dedication woven into every aspect of our operation, we strive to not
            only rescue and rehabilitate animals but also to educate and advocate
            for their well-being. Every wag of a tail, every purr of contentment,
            fuels our commitment to making a difference in the lives of those who
            cannot speak for themselves. Together with our devoted staff,
            volunteers, and supporters, we are building a community where every
            animal is valued and cherished. Join us in our journey to create a
            world where every paw print leaves a trail of hope.
          </p>
        </div>
      </div>
    </>
  );
}
