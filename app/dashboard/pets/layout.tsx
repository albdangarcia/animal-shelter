export default function PetsLayout({ children, modal }: { children: React.ReactNode, modal: React.ReactNode }) {
    return (
      <>
        {children}
        {modal}
      </>
    )
  }