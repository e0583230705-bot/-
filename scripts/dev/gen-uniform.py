#!/usr/bin/env python3
# יוצר קובצי מבנה אחיד (BKMVDATA.TXT + INI.TXT, Windows-1255) מכרטסת CSV — לבדיקות בלבד, נתונים מדומים
import csv, sys, os
src, outdir, scale, year = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
skip = set(sys.argv[5].split(",")) if len(sys.argv) > 5 else set()
os.makedirs(outdir, exist_ok=True)
def rec(length, fields):
    c=[" "]*length
    for f,t,v,k in fields:
        w=t-f+1; s=str(v).rjust(w,"0") if k=="n" else str(v).ljust(w," ")
        assert len(s)==w,(f,t,v); c[f-1:t]=list(s)
    return "".join(c)
money=lambda a:("-" if a<0 else "+")+str(abs(a)).rjust(14,"0")
OSEK=515555555; MAIN=987654321012345
rows=list(csv.reader(open(src,encoding="utf-8")))[1:]
lines=[]; accts={}; tot={}
for d,n,acc,name,desc,ref,dr,cr in rows:
    if acc in skip: continue
    raw=float(dr or 0) or float(cr or 0); amt=round(raw*scale*100); side=1 if dr else 2
    dd,mm,_=d.split("/"); lines.append((int(n),f"{year}{mm}{dd}",acc,side,amt,desc,ref)); accts[acc]=name
    t=tot.setdefault(acc,[0,0]); t[0 if side==1 else 1]+=amt
recs=[rec(95,[(1,4,"A100","x"),(5,13,1,"n"),(14,22,OSEK,"n"),(23,37,MAIN,"n"),(38,45,"&OF1.31&","x")])]; no=2
for acc,name in accts.items():
    recs.append(rec(376,[(1,4,"B110","x"),(5,13,no,"n"),(14,22,OSEK,"n"),(23,37,acc,"x"),(38,87,name,"x"),(88,102,acc[0]+"0","x"),(103,132,{"1":"רכוש שוטף","2":"התחייבויות","3":"ספקים","4":"הכנסות","6":"הוצאות הנהלה"}.get(acc[0],"אחר"),"x"),(278,292,money(0),"x"),(293,307,money(tot[acc][0]),"x"),(308,322,money(tot[acc][1]),"x")])); no+=1
ln={}
for n,d,acc,side,amt,desc,ref in lines:
    ln[n]=ln.get(n,0)+1
    recs.append(rec(317,[(1,4,"B100","x"),(5,13,no,"n"),(14,22,OSEK,"n"),(23,32,n,"n"),(33,37,ln[n],"n"),(61,80,ref,"x"),(107,156,desc,"x"),(157,164,d,"n"),(165,172,d,"n"),(173,187,acc,"x"),(203,203,side,"n"),(207,221,money(amt),"x"),(276,283,d,"n")])); no+=1
recs.append(rec(110,[(1,4,"Z900","x"),(5,13,no,"n"),(14,22,OSEK,"n"),(23,37,MAIN,"n"),(38,45,"&OF1.31&","x"),(46,60,no,"n")]))
open(f"{outdir}/BKMVDATA.TXT","wb").write(("\r\n".join(recs)+"\r\n").encode("cp1255"))
ini=[rec(466,[(1,4,"A000","x"),(10,24,len(recs),"n"),(25,33,OSEK,"n"),(34,48,MAIN,"n"),(49,56,"&OF1.31&","x"),(57,64,12345678,"n"),(65,84,"חשבשבת לדוגמה","x"),(215,264,'חברת הדוגמה בע"מ',"x"),(363,366,int(year),"n"),(367,374,int(year+"0101"),"n"),(375,382,int(year+"1231"),"n"),(396,396,1,"n")])]
ini+=[rec(19,[(1,4,"B100","x"),(5,19,len(lines),"n")]),rec(19,[(1,4,"B110","x"),(5,19,len(accts),"n")])]
open(f"{outdir}/INI.TXT","wb").write(("\r\n".join(ini)+"\r\n").encode("cp1255"))
print(outdir, len(recs))
