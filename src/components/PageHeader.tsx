export function PageHeader({title,subtitle,action}:{title:string,subtitle?:string,action?:React.ReactNode}){
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black tracking-tight text-ink">{title}</h1>{subtitle&&<p className="mt-1 text-sm text-slate-600">{subtitle}</p>}</div>{action}</div>
}
